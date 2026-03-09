import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, publishJobs } from "@/db/schema";
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

const assertMutableJob = (status: (typeof publishJobs.$inferSelect)["status"]) => {
  if (status === "published" || status === "canceled") {
    throw conflict(`Cannot modify a ${status} job.`);
  }
  if (status === "processing") {
    throw conflict("Cannot modify a job that is currently processing.");
  }
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
  const nextLocationId = payload.locationId !== undefined
    ? payload.locationId
    : existing.locationId;
  const nextUserTags = payload.userTags !== undefined
    ? payload.userTags
    : existing.userTags;
  const metadataIssues = getMetaMetadataValidationIssues({
    media: nextMedia,
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

  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "queued",
      caption: payload.caption ?? existing.caption,
      firstComment:
        payload.firstComment !== undefined
          ? payload.firstComment
          : existing.firstComment,
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
