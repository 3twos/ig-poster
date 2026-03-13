import { isDeepStrictEqual } from "node:util";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { publishJobs } from "@/db/schema";
import { listFacebookPageScheduledPosts } from "@/lib/meta";
import type { ResolvedMetaAuth } from "@/lib/meta-auth";
import { appendPublishJobEvent, createPublishJob } from "@/lib/publish-jobs";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";
import type { Actor } from "@/services/actors";

const ACTIVE_REMOTE_SYNC_STATUSES = ["queued", "processing", "failed"] as const;

export type FacebookScheduledSyncResult = {
  imported: number;
  updated: number;
  unchanged: number;
};

const syncLinkedDestinationState = async (
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
    desiredState: "scheduled",
    remoteState: "scheduled",
    caption: existing.caption,
    publishAt: existing.publishAt,
    remoteObjectId: existing.publishId ?? existing.creationId ?? null,
    remoteContainerId: existing.creationId ?? null,
    remotePermalink: null,
    remoteStatePayload: {
      scheduledPublishTime: existing.publishAt.toISOString(),
      importedFromMeta: true,
    },
    lastSyncedAt: new Date(),
    lastError: null,
  });
};

export const syncFacebookScheduledPublishJobs = async (
  actor: Actor,
  resolvedAuth: ResolvedMetaAuth,
): Promise<FacebookScheduledSyncResult> => {
  if (!resolvedAuth.account.pageId?.trim()) {
    return { imported: 0, updated: 0, unchanged: 0 };
  }

  const remotePosts = await listFacebookPageScheduledPosts(resolvedAuth.auth);
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
      .where(eq(publishJobs.id, existing.id))
      .returning();

    if (!nextRow) {
      unchanged += 1;
      continue;
    }

    await syncLinkedDestinationState(nextRow);
    updated += 1;
  }

  return {
    imported,
    updated,
    unchanged,
  };
};
