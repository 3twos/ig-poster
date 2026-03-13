import { isDeepStrictEqual } from "node:util";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, publishJobs, type PublishJobRow } from "@/db/schema";
import {
  deleteFacebookPagePost,
  getEnvMetaAuth,
  updateFacebookPagePost,
} from "@/lib/meta";
import {
  MetaMediaPreflightError,
  preflightMetaMediaForPublish,
} from "@/lib/meta-media-preflight";
import {
  getMetaMetadataValidationIssues,
  type PublishJobStatus,
  type PublishJobUpdateRequest,
  PublishJobUpdateRequestSchema,
} from "@/lib/meta-schemas";
import {
  appendPublishJobEvent,
  listPublishJobsForOwner,
  markPostScheduled,
} from "@/lib/publish-jobs";
import { resolveMetaAuthForApi } from "@/services/meta-auth";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";
import type { Actor } from "@/services/actors";

const RACE_CONFLICT_MESSAGE =
  "Publish job state changed concurrently. Refresh and try again.";

export class PublishJobServiceError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = "PublishJobServiceError";
    this.status = status;
  }
}

const conflict = (message: string) => new PublishJobServiceError(409, message);
const invalid = (message: string) => new PublishJobServiceError(400, message);

export const listPublishJobs = (
  actor: Actor,
  options: {
    statuses?: PublishJobStatus[];
    limit?: number;
  } = {},
) => listPublishJobsForOwner(getDb(), actor.ownerHash, options);

export const getPublishJob = async (actor: Actor, id: string) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(publishJobs)
    .where(and(eq(publishJobs.id, id), eq(publishJobs.ownerHash, actor.ownerHash)))
    .limit(1);

  return row ?? null;
};

const updateLinkedPostAfterCancel = async (
  db: ReturnType<typeof getDb>,
  actor: Actor,
  postId: string,
  action: "cancel" | "move-to-draft",
) => {
  const [post] = await db
    .select({ status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, actor.ownerHash)))
    .limit(1);

  if (!post) {
    return;
  }

  await db
    .update(posts)
    .set({
      status:
        action === "move-to-draft"
          ? post.status === "posted"
            ? "posted"
            : "draft"
          : post.status,
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, actor.ownerHash)));
};

const buildJobWriteWhere = (
  actor: Actor,
  existing: Pick<
    typeof publishJobs.$inferSelect,
    "id" | "ownerHash" | "status" | "updatedAt"
  >,
) =>
  and(
    eq(publishJobs.id, existing.id),
    eq(publishJobs.ownerHash, actor.ownerHash),
    eq(publishJobs.status, existing.status),
    eq(publishJobs.updatedAt, existing.updatedAt),
  );

const buildRemoteAuthoritativeWriteWhere = (
  actor: Actor,
  existing: Pick<
    typeof publishJobs.$inferSelect,
    "id" | "ownerHash" | "status"
  >,
) =>
  and(
    eq(publishJobs.id, existing.id),
    eq(publishJobs.ownerHash, actor.ownerHash),
    eq(publishJobs.status, existing.status),
  );

const assertMutableJob = (status: (typeof publishJobs.$inferSelect)["status"]) => {
  if (status === "published" || status === "canceled") {
    throw conflict(`Cannot modify a ${status} job.`);
  }
  if (status === "processing") {
    throw conflict("Cannot modify a job that is currently processing.");
  }
};

const isRemoteAuthoritativeFacebookJob = (
  row: Pick<PublishJobRow, "destination" | "remoteAuthority">,
) =>
  row.destination === "facebook" &&
  row.remoteAuthority === "remote_authoritative";

const resolveRemoteAuthoritativeFacebookAuth = async (
  actor: Actor,
  job: Pick<PublishJobRow, "authSource" | "connectionId">,
) => {
  if (job.connectionId) {
    const resolved = await resolveMetaAuthForApi({
      connectionId: job.connectionId,
      ownerHash: actor.ownerHash,
    });
    return resolved.auth;
  }

  if (job.authSource === "env") {
    const auth = getEnvMetaAuth();
    if (auth) {
      return auth;
    }
  }

  throw conflict(
    "Publishing credentials for this Meta-synced Facebook schedule are no longer available.",
  );
};

const syncCanceledFacebookDestination = async (
  db: ReturnType<typeof getDb>,
  job: Pick<
    PublishJobRow,
    "postId" | "remoteAuthority" | "caption"
  >,
  action: "cancel" | "move-to-draft",
) => {
  if (!job.postId) {
    return;
  }

  await upsertPostDestinationRemoteState(db, {
    postId: job.postId,
    destination: "facebook",
    enabled: true,
    syncMode: job.remoteAuthority,
    desiredState: action === "move-to-draft" ? "draft" : "canceled",
    remoteState: "canceled",
    caption: job.caption,
    publishAt: null,
    remoteObjectId: null,
    remoteContainerId: null,
    remotePermalink: null,
    remoteStatePayload: {},
    lastSyncedAt: new Date(),
    lastError: null,
  });
};

const syncScheduledFacebookDestination = async (
  db: ReturnType<typeof getDb>,
  job: Pick<
    PublishJobRow,
    "postId" | "remoteAuthority" | "caption" | "publishAt" | "publishId" | "creationId"
  >,
  remoteState: {
    isPublished: boolean;
    scheduledPublishTime?: string;
    remoteObjectId: string;
    publishId?: string;
    creationId?: string;
    remotePermalink?: string;
  },
  nextCaption: string,
) => {
  if (!job.postId) {
    return;
  }

  await upsertPostDestinationRemoteState(db, {
    postId: job.postId,
    destination: "facebook",
    enabled: true,
    syncMode: job.remoteAuthority,
    desiredState: "scheduled",
    remoteState: remoteState.isPublished ? "published" : "scheduled",
    caption: nextCaption,
    publishAt: remoteState.scheduledPublishTime
      ? new Date(remoteState.scheduledPublishTime)
      : job.publishAt,
    remoteObjectId:
      remoteState.publishId ??
      remoteState.remoteObjectId ??
      job.publishId ??
      job.creationId ??
      null,
    remoteContainerId:
      remoteState.creationId ??
      job.creationId ??
      null,
    remotePermalink: remoteState.remotePermalink ?? null,
    remoteStatePayload: {
      scheduledPublishTime:
        remoteState.scheduledPublishTime ??
        job.publishAt.toISOString(),
      isPublished: remoteState.isPublished,
    },
    lastSyncedAt: new Date(),
    lastError: null,
  });
};

const cancelRemoteAuthoritativeFacebookJob = async (
  db: ReturnType<typeof getDb>,
  actor: Actor,
  existing: PublishJobRow,
  action: "cancel" | "move-to-draft",
) => {
  const auth = await resolveRemoteAuthoritativeFacebookAuth(actor, existing);
  await deleteFacebookPagePost(
    {
      publishId: existing.publishId ?? undefined,
      creationId: existing.creationId ?? undefined,
    },
    auth,
  );

  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "canceled",
      canceledAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
      events: appendPublishJobEvent(existing.events, {
        type: "canceled",
        detail:
          action === "move-to-draft"
            ? "Moved back to draft by user."
            : "Canceled by user.",
      }),
    })
    .where(buildRemoteAuthoritativeWriteWhere(actor, existing))
    .returning();

  if (!updated) {
    throw conflict(RACE_CONFLICT_MESSAGE);
  }

  if (existing.postId) {
    await updateLinkedPostAfterCancel(db, actor, existing.postId, action);
  }

  await syncCanceledFacebookDestination(db, existing, action);

  return updated;
};

const validateRemoteAuthoritativeFacebookEdit = (
  existing: PublishJobRow,
  payload: Extract<PublishJobUpdateRequest, { action: "edit" }>,
) => {
  if (payload.media && !isDeepStrictEqual(payload.media, existing.media)) {
    throw conflict(
      "Media changes are not supported for Meta-synced Facebook schedules yet.",
    );
  }
};

const updateRemoteAuthoritativeFacebookJob = async (
  db: ReturnType<typeof getDb>,
  actor: Actor,
  existing: PublishJobRow,
  payload:
    | Extract<PublishJobUpdateRequest, { action: "reschedule" }>
    | Extract<PublishJobUpdateRequest, { action: "edit" }>,
) => {
  const nextCaption = payload.action === "edit"
    ? payload.caption ?? existing.caption
    : existing.caption;
  const nextPublishAtIso = payload.publishAt ?? existing.publishAt.toISOString();
  const shouldUpdateRemoteCaption =
    payload.action === "edit" && payload.caption !== undefined;
  const shouldUpdateRemoteSchedule = payload.publishAt !== undefined;
  if (existing.media.mode === "carousel") {
    throw invalid(
      "Facebook publishing currently supports single image and single video posts only.",
    );
  }

  let remoteState: {
    remoteObjectId: string;
    publishId?: string;
    creationId?: string;
    isPublished: boolean;
    scheduledPublishTime?: string;
    remotePermalink?: string;
  } = {
    remoteObjectId:
      existing.publishId ??
      existing.creationId ??
      existing.id,
    publishId: existing.publishId ?? undefined,
    creationId: existing.creationId ?? undefined,
    isPublished: false,
    scheduledPublishTime: existing.publishAt.toISOString(),
    remotePermalink: undefined as string | undefined,
  };

  if (payload.action === "edit") {
    validateRemoteAuthoritativeFacebookEdit(existing, payload);
  }

  if (shouldUpdateRemoteCaption || shouldUpdateRemoteSchedule) {
    const auth = await resolveRemoteAuthoritativeFacebookAuth(actor, existing);
    remoteState = await updateFacebookPagePost(
      {
        mediaMode: existing.media.mode,
        publishId: existing.publishId ?? undefined,
        creationId: existing.creationId ?? undefined,
        ...(shouldUpdateRemoteCaption ? { caption: nextCaption } : {}),
        ...(shouldUpdateRemoteSchedule ? { publishAt: nextPublishAtIso } : {}),
      },
      auth,
    );
  }

  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "queued",
      caption: nextCaption,
      firstComment:
        payload.action === "edit" && payload.firstComment !== undefined
          ? payload.firstComment
          : existing.firstComment,
      locationId:
        payload.action === "edit" && payload.locationId !== undefined
          ? payload.locationId
          : existing.locationId,
      userTags:
        payload.action === "edit" && payload.userTags !== undefined
          ? payload.userTags
          : existing.userTags,
      media: existing.media,
      publishAt: new Date(
        remoteState.scheduledPublishTime ?? nextPublishAtIso,
      ),
      outcomeContext:
        payload.action === "edit" && payload.outcomeContext !== undefined
          ? payload.outcomeContext
          : existing.outcomeContext,
      attempts: 0,
      lastAttemptAt: null,
      completedAt: null,
      lastError: null,
      updatedAt: new Date(),
      events: appendPublishJobEvent(existing.events, {
        type: "updated",
        detail:
          payload.action === "reschedule"
            ? `Rescheduled in Meta to ${new Date(remoteState.scheduledPublishTime ?? nextPublishAtIso).toISOString()}.`
            : shouldUpdateRemoteCaption || shouldUpdateRemoteSchedule
              ? "Meta-synced Facebook schedule updated by user."
              : "Job details updated by user.",
      }),
    })
    .where(buildRemoteAuthoritativeWriteWhere(actor, existing))
    .returning();

  if (!updated) {
    throw conflict(RACE_CONFLICT_MESSAGE);
  }

  if (existing.postId) {
    await markPostScheduled(db, actor.ownerHash, existing.postId);
  }

  if (shouldUpdateRemoteCaption || shouldUpdateRemoteSchedule) {
    await syncScheduledFacebookDestination(db, updated, remoteState, nextCaption);
  }

  return updated;
};

export const updatePublishJob = async (
  actor: Actor,
  id: string,
  input: PublishJobUpdateRequest,
) => {
  const payload = PublishJobUpdateRequestSchema.parse(input);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(publishJobs)
    .where(and(eq(publishJobs.id, id), eq(publishJobs.ownerHash, actor.ownerHash)))
    .limit(1);

  if (!existing) {
    throw new PublishJobServiceError(404, "Publish job not found");
  }

  if (payload.action === "cancel" || payload.action === "move-to-draft") {
    if (existing.status === "published" || existing.status === "canceled") {
      throw conflict(
        payload.action === "move-to-draft"
          ? `Cannot move a ${existing.status} job back to draft.`
          : `Cannot cancel a ${existing.status} job.`,
      );
    }

    if (existing.status === "processing") {
      throw conflict("Cannot cancel a job that is currently processing.");
    }

    if (payload.action === "move-to-draft" && !existing.postId) {
      throw conflict("Only saved posts can be moved back to draft.");
    }

    if (isRemoteAuthoritativeFacebookJob(existing)) {
      return cancelRemoteAuthoritativeFacebookJob(db, actor, existing, payload.action);
    }

    const [updated] = await db
      .update(publishJobs)
      .set({
        status: "canceled",
        canceledAt: new Date(),
        updatedAt: new Date(),
        events: appendPublishJobEvent(existing.events, {
          type: "canceled",
          detail:
            payload.action === "move-to-draft"
              ? "Moved back to draft by user."
              : "Canceled by user.",
        }),
      })
      .where(buildJobWriteWhere(actor, existing))
      .returning();

    if (!updated) {
      throw conflict(RACE_CONFLICT_MESSAGE);
    }

    if (existing.postId) {
      await updateLinkedPostAfterCancel(db, actor, existing.postId, payload.action);
    }

    return updated;
  }

  assertMutableJob(existing.status);

  if (payload.action === "retry-now") {
    if (isRemoteAuthoritativeFacebookJob(existing)) {
      throw conflict(
        "Retry now is not available for Meta-synced Facebook schedules. Create a new schedule instead.",
      );
    }

    if (existing.status !== "failed") {
      throw conflict("Retry now is only available for failed jobs.");
    }

    const [updated] = await db
      .update(publishJobs)
      .set({
        status: "queued",
        publishAt: new Date(),
        attempts: 0,
        lastAttemptAt: null,
        completedAt: null,
        lastError: null,
        updatedAt: new Date(),
        events: appendPublishJobEvent(existing.events, {
          type: "updated",
          detail: "Retry requested by user.",
        }),
      })
      .where(buildJobWriteWhere(actor, existing))
      .returning();

    if (!updated) {
      throw conflict(RACE_CONFLICT_MESSAGE);
    }

    if (existing.postId) {
      await markPostScheduled(db, actor.ownerHash, existing.postId);
    }

    return updated;
  }

  if (payload.action === "reschedule") {
    if (isRemoteAuthoritativeFacebookJob(existing)) {
      return updateRemoteAuthoritativeFacebookJob(db, actor, existing, payload);
    }

    const [updated] = await db
      .update(publishJobs)
      .set({
        status: "queued",
        publishAt: new Date(payload.publishAt),
        attempts: 0,
        lastAttemptAt: null,
        completedAt: null,
        lastError: null,
        updatedAt: new Date(),
        events: appendPublishJobEvent(existing.events, {
          type: "updated",
          detail: `Rescheduled to ${new Date(payload.publishAt).toISOString()}.`,
        }),
      })
      .where(buildJobWriteWhere(actor, existing))
      .returning();

    if (!updated) {
      throw conflict(RACE_CONFLICT_MESSAGE);
    }

    if (existing.postId) {
      await markPostScheduled(db, actor.ownerHash, existing.postId);
    }

    return updated;
  }

  const nextMedia = payload.media ?? existing.media;
  const nextFirstComment = payload.firstComment !== undefined
    ? payload.firstComment
    : existing.firstComment;
  const nextLocationId = payload.locationId !== undefined
    ? payload.locationId
    : existing.locationId;
  const nextUserTags = payload.userTags !== undefined
    ? payload.userTags
    : existing.userTags;
  const metadataIssues = getMetaMetadataValidationIssues({
    destination: existing.destination,
    media: nextMedia,
    firstComment: nextFirstComment,
    locationId: nextLocationId,
    userTags: nextUserTags,
  });

  if (metadataIssues.length > 0) {
    throw invalid(
      metadataIssues[0]?.message ??
        "Publish metadata is not valid for this media type.",
    );
  }

  if (payload.media) {
    await preflightMetaMediaForPublish(payload.media);
  }

  if (isRemoteAuthoritativeFacebookJob(existing)) {
    return updateRemoteAuthoritativeFacebookJob(db, actor, existing, payload);
  }

  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "queued",
      caption: payload.caption ?? existing.caption,
      firstComment: nextFirstComment,
      locationId: nextLocationId,
      userTags: nextUserTags,
      media: nextMedia,
      publishAt: payload.publishAt ? new Date(payload.publishAt) : existing.publishAt,
      outcomeContext:
        payload.outcomeContext !== undefined
          ? payload.outcomeContext
          : existing.outcomeContext,
      attempts: 0,
      lastAttemptAt: null,
      completedAt: null,
      lastError: null,
      updatedAt: new Date(),
      events: appendPublishJobEvent(existing.events, {
        type: "updated",
        detail: "Job details updated by user.",
      }),
    })
    .where(buildJobWriteWhere(actor, existing))
    .returning();

  if (!updated) {
    throw conflict(RACE_CONFLICT_MESSAGE);
  }

  if (existing.postId) {
    await markPostScheduled(db, actor.ownerHash, existing.postId);
  }

  return updated;
};

export { MetaMediaPreflightError };
