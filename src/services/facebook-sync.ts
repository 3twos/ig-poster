import { isDeepStrictEqual } from "node:util";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { posts, publishJobs } from "@/db/schema";
import {
  getFacebookPagePublishState,
  listFacebookPageScheduledPosts,
  type FacebookPagePublishState,
} from "@/lib/meta";
import type { ResolvedMetaAuth } from "@/lib/meta-auth";
import {
  appendPublishJobEvent,
  createPublishJob,
  markPostPublished,
} from "@/lib/publish-jobs";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";
import type { Actor } from "@/services/actors";

type FacebookSyncActor = Pick<Actor, "ownerHash">;

const ACTIVE_REMOTE_SYNC_STATUSES = ["queued", "failed"] as const;

export type FacebookScheduledSyncResult = {
  imported: number;
  updated: number;
  published: number;
  canceled: number;
  unchanged: number;
};

const buildSyncWriteWhere = (
  existing: (typeof publishJobs.$inferSelect),
) =>
  and(
    eq(publishJobs.id, existing.id),
    eq(publishJobs.updatedAt, existing.updatedAt),
    inArray(publishJobs.status, [...ACTIVE_REMOTE_SYNC_STATUSES]),
  );

const syncScheduledLinkedDestinationState = async (
  existing: (typeof publishJobs.$inferSelect),
  options: {
    remotePermalink?: string | null;
    remoteStatePayload?: Record<string, unknown>;
  } = {},
) => {
  if (!existing.postId) {
    return;
  }

  const db = getDb();
  await upsertPostDestinationRemoteState(db, {
    postId: existing.postId,
    destination: "facebook",
    enabled: true,
    syncMode: existing.remoteAuthority,
    desiredState: "scheduled",
    remoteState: "scheduled",
    caption: existing.caption,
    publishAt: existing.publishAt,
    remoteObjectId: existing.publishId ?? existing.creationId ?? null,
    remoteContainerId: existing.creationId ?? null,
    remotePermalink: options.remotePermalink ?? null,
    remoteStatePayload: options.remoteStatePayload ?? {
      scheduledPublishTime: existing.publishAt.toISOString(),
      importedFromMeta: true,
    },
    lastSyncedAt: new Date(),
    lastError: null,
  });
};

const syncPublishedLinkedDestinationState = async (
  ownerHash: string,
  existing: (typeof publishJobs.$inferSelect),
  remoteState: FacebookPagePublishState,
) => {
  if (!existing.postId) {
    return;
  }

  const db = getDb();
  await markPostPublished(
    db,
    ownerHash,
    existing.postId,
    remoteState.publishId ??
      existing.publishId ??
      remoteState.remoteObjectId,
    "facebook",
  );
  await upsertPostDestinationRemoteState(db, {
    postId: existing.postId,
    destination: "facebook",
    enabled: true,
    syncMode: existing.remoteAuthority,
    desiredState: "published",
    remoteState: "published",
    caption: existing.caption,
    publishAt: existing.publishAt,
    remoteObjectId:
      remoteState.publishId ??
      remoteState.remoteObjectId ??
      existing.publishId ??
      existing.creationId ??
      null,
    remoteContainerId:
      remoteState.creationId ??
      existing.creationId ??
      null,
    remotePermalink: remoteState.remotePermalink ?? null,
    remoteStatePayload: {
      scheduledPublishTime:
        remoteState.scheduledPublishTime ??
        existing.publishAt.toISOString(),
      syncedFromMeta: true,
    },
    lastSyncedAt: new Date(),
    lastError: null,
  });
};

const updateLinkedPostAfterRemoteCancel = async (
  ownerHash: string,
  postId: string,
) => {
  const db = getDb();
  const [post] = await db
    .select({ status: posts.status })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, ownerHash)))
    .limit(1);

  if (!post) {
    return;
  }

  await db
    .update(posts)
    .set({
      status: post.status === "posted" ? "posted" : "draft",
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, postId), eq(posts.ownerHash, ownerHash)));
};

const syncCanceledLinkedDestinationState = async (
  existing: (typeof publishJobs.$inferSelect),
) => {
  if (!existing.postId) {
    return;
  }

  const db = getDb();
  await upsertPostDestinationRemoteState(db, {
    postId: existing.postId,
    destination: "facebook",
    enabled: true,
    syncMode: existing.remoteAuthority,
    desiredState: "draft",
    remoteState: "canceled",
    caption: existing.caption,
    publishAt: null,
    remoteObjectId: null,
    remoteContainerId: null,
    remotePermalink: null,
    remoteStatePayload: {
      removedFromMeta: true,
      syncedFromMeta: true,
    },
    lastSyncedAt: new Date(),
    lastError: null,
  });
};

const isMissingFacebookPagePostError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unsupported get request|does not exist|unknown path/i.test(message);
};

const markRemoteFacebookJobPublished = async (
  ownerHash: string,
  existing: (typeof publishJobs.$inferSelect),
  remoteState: FacebookPagePublishState,
) => {
  const db = getDb();
  const now = new Date();
  const publishId =
    remoteState.publishId ??
    existing.publishId ??
    remoteState.remoteObjectId;
  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "published",
      publishId,
      creationId: remoteState.creationId ?? existing.creationId,
      lastError: null,
      canceledAt: null,
      completedAt: now,
      updatedAt: now,
      events: appendPublishJobEvent(existing.events, {
        type: "published",
        attempt: existing.attempts,
        detail: `Observed Meta publishing Facebook post ${publishId} during sync.`,
      }),
    })
    .where(buildSyncWriteWhere(existing))
    .returning();

  if (!updated) {
    return null;
  }

  await syncPublishedLinkedDestinationState(ownerHash, updated, remoteState);
  return updated;
};

const markRemoteFacebookJobCanceled = async (
  ownerHash: string,
  existing: (typeof publishJobs.$inferSelect),
) => {
  const db = getDb();
  const now = new Date();
  const remoteObjectId = existing.publishId ?? existing.creationId ?? existing.id;
  const [updated] = await db
    .update(publishJobs)
    .set({
      status: "canceled",
      canceledAt: now,
      completedAt: null,
      lastError: null,
      updatedAt: now,
      events: appendPublishJobEvent(existing.events, {
        type: "canceled",
        detail:
          `Meta no longer reports scheduled Facebook post ${remoteObjectId}; marked canceled during sync.`,
      }),
    })
    .where(buildSyncWriteWhere(existing))
    .returning();

  if (!updated) {
    return null;
  }

  if (updated.postId) {
    await updateLinkedPostAfterRemoteCancel(ownerHash, updated.postId);
  }
  await syncCanceledLinkedDestinationState(updated);
  return updated;
};

const reconcileMissingRemoteFacebookJob = async (
  ownerHash: string,
  existing: (typeof publishJobs.$inferSelect),
  resolvedAuth: ResolvedMetaAuth,
) => {
  try {
    const remoteState = await getFacebookPagePublishState(
      {
        publishId: existing.publishId ?? undefined,
        creationId: existing.creationId ?? undefined,
      },
      resolvedAuth.auth,
    );

    if (remoteState.isPublished) {
      const updated = await markRemoteFacebookJobPublished(
        ownerHash,
        existing,
        remoteState,
      );
      return updated ? "published" : "unchanged";
    }

    return "unchanged";
  } catch (error) {
    if (!isMissingFacebookPagePostError(error)) {
      console.warn(
        "[facebook-sync] Could not reconcile missing Facebook schedule",
        error,
      );
      return "unchanged";
    }

    const updated = await markRemoteFacebookJobCanceled(ownerHash, existing);
    return updated ? "canceled" : "unchanged";
  }
};

export const syncFacebookScheduledPublishJobs = async (
  actor: FacebookSyncActor,
  resolvedAuth: ResolvedMetaAuth,
): Promise<FacebookScheduledSyncResult> => {
  if (!resolvedAuth.account.pageId?.trim()) {
    return {
      imported: 0,
      updated: 0,
      published: 0,
      canceled: 0,
      unchanged: 0,
    };
  }

  const remotePosts = await listFacebookPageScheduledPosts(resolvedAuth.auth);
  const remotePostIds = new Set(remotePosts.map((post) => post.remoteObjectId));
  const db = getDb();
  const existingRows = await db
    .select()
    .from(publishJobs)
    .where(
      and(
        eq(publishJobs.ownerHash, actor.ownerHash),
        eq(publishJobs.destination, "facebook"),
        eq(publishJobs.remoteAuthority, "remote_authoritative"),
        inArray(publishJobs.status, [...ACTIVE_REMOTE_SYNC_STATUSES]),
      ),
    );

  const existingByPublishId = new Map(
    existingRows
      .filter((row) => Boolean(row.publishId))
      .map((row) => [row.publishId!, row]),
  );

  let imported = 0;
  let updated = 0;
  let published = 0;
  let canceled = 0;
  let unchanged = 0;

  for (const remotePost of remotePosts) {
    const existing = existingByPublishId.get(remotePost.remoteObjectId);

    if (!existing) {
      const [duplicate] = await db
        .select({ id: publishJobs.id })
        .from(publishJobs)
        .where(
          and(
            eq(publishJobs.ownerHash, actor.ownerHash),
            eq(publishJobs.destination, "facebook"),
            eq(publishJobs.remoteAuthority, "remote_authoritative"),
            eq(publishJobs.publishId, remotePost.remoteObjectId),
          ),
        )
        .limit(1);

      if (duplicate) {
        unchanged += 1;
        continue;
      }

      await createPublishJob(db, {
        ownerHash: actor.ownerHash,
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
        accountKey: resolvedAuth.account.accountKey,
        pageId: resolvedAuth.account.pageId,
        instagramUserId: resolvedAuth.account.instagramUserId,
        caption: remotePost.caption,
        media: remotePost.media,
        publishAt: remotePost.publishAt,
        authSource: resolvedAuth.source,
        connectionId: resolvedAuth.account.connectionId,
        publishId: remotePost.remoteObjectId,
        markPostScheduled: false,
      });
      imported += 1;
      continue;
    }

    const shouldUpdate =
      existing.status !== "queued" ||
      existing.caption !== remotePost.caption ||
      existing.publishAt.toISOString() !== remotePost.publishAt ||
      !isDeepStrictEqual(existing.media, remotePost.media) ||
      existing.lastError !== null ||
      existing.authSource !== resolvedAuth.source ||
      existing.connectionId !== (resolvedAuth.account.connectionId ?? null) ||
      existing.pageId !== (resolvedAuth.account.pageId ?? null) ||
      existing.instagramUserId !== resolvedAuth.account.instagramUserId;

    if (!shouldUpdate) {
      unchanged += 1;
      continue;
    }

    const [nextRow] = await db
      .update(publishJobs)
      .set({
        status: "queued",
        caption: remotePost.caption,
        media: remotePost.media,
        publishAt: new Date(remotePost.publishAt),
        accountKey: resolvedAuth.account.accountKey,
        pageId: resolvedAuth.account.pageId,
        instagramUserId: resolvedAuth.account.instagramUserId,
        authSource: resolvedAuth.source,
        connectionId: resolvedAuth.account.connectionId,
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
        canceledAt: null,
        updatedAt: new Date(),
        events: appendPublishJobEvent(existing.events, {
          type: "updated",
          detail: `Synced scheduled Facebook post ${remotePost.remoteObjectId} from Meta.`,
        }),
      })
      .where(buildSyncWriteWhere(existing))
      .returning();

    if (!nextRow) {
      unchanged += 1;
      continue;
    }

    await syncScheduledLinkedDestinationState(nextRow, {
      remotePermalink: remotePost.remotePermalink ?? null,
      remoteStatePayload: {
        scheduledPublishTime: remotePost.publishAt,
        importedFromMeta: true,
      },
    });
    updated += 1;
  }

  for (const existing of existingRows) {
    if (!existing.publishId || remotePostIds.has(existing.publishId)) {
      continue;
    }

    const reconciled = await reconcileMissingRemoteFacebookJob(
      actor.ownerHash,
      existing,
      resolvedAuth,
    );

    if (reconciled === "published") {
      published += 1;
      continue;
    }

    if (reconciled === "canceled") {
      canceled += 1;
      continue;
    }

    unchanged += 1;
  }

  return {
    imported,
    updated,
    published,
    canceled,
    unchanged,
  };
};
