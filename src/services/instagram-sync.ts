import type { PostDestinationRow, PostRow, PublishHistoryEntry } from "@/db/schema";
import { getDb } from "@/db";
import { getInstagramMediaPublishState } from "@/lib/meta";
import { markPostPublished } from "@/lib/publish-jobs";
import type { ResolvedMetaAuth } from "@/lib/meta-auth";
import {
  syncPublishedInstagramDestination,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";
import type { Actor } from "@/services/actors";

const INSTAGRAM_PUBLISHED_SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type SyncableInstagramDestination = Pick<
  PostDestinationRow,
  | "destination"
  | "enabled"
  | "syncMode"
  | "desiredState"
  | "remoteState"
  | "caption"
  | "firstComment"
  | "locationId"
  | "userTags"
  | "publishAt"
  | "remoteObjectId"
  | "remoteContainerId"
  | "remotePermalink"
  | "remoteStatePayload"
  | "lastSyncedAt"
  | "lastError"
>;

type SyncablePost = Pick<
  PostRow,
  | "id"
  | "status"
  | "publishSettings"
  | "publishHistory"
  | "publishedAt"
>;

export type InstagramPublishedPostSyncResult = {
  attempted: boolean;
  synced: boolean;
  skippedReason?: "not_posted" | "no_media_id" | "fresh";
  error?: string;
};

const latestInstagramHistoryEntry = (
  history: PublishHistoryEntry[] | null | undefined,
) =>
  [...(history ?? [])]
    .filter((entry) => entry.igMediaId)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0];

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const getInstagramSyncTarget = (
  row: SyncablePost,
  destinations: SyncableInstagramDestination[],
  now = new Date(),
) => {
  if (row.status !== "posted") {
    return { shouldSync: false, skippedReason: "not_posted" as const };
  }

  const destination = destinations.find((entry) => entry.destination === "instagram");
  const latestHistory = latestInstagramHistoryEntry(row.publishHistory);
  const mediaId = destination?.remoteObjectId ?? latestHistory?.igMediaId ?? null;

  if (!mediaId) {
    return { shouldSync: false, skippedReason: "no_media_id" as const };
  }

  const lastSyncedAt = destination?.lastSyncedAt ?? null;
  const isFresh =
    Boolean(destination?.remotePermalink) &&
    destination?.desiredState === "published" &&
    destination?.remoteState === "published" &&
    !destination?.lastError &&
    lastSyncedAt instanceof Date &&
    now.getTime() - lastSyncedAt.getTime() < INSTAGRAM_PUBLISHED_SYNC_MAX_AGE_MS;

  if (isFresh) {
    return { shouldSync: false, skippedReason: "fresh" as const };
  }

  return {
    shouldSync: true,
    destination,
    latestHistory,
    mediaId,
  };
};

export const syncInstagramPublishedPost = async (
  actor: Pick<Actor, "ownerHash">,
  resolvedAuth: ResolvedMetaAuth,
  row: SyncablePost,
  destinations: SyncableInstagramDestination[],
): Promise<InstagramPublishedPostSyncResult> => {
  const target = getInstagramSyncTarget(row, destinations);
  if (!target.shouldSync) {
    return {
      attempted: false,
      synced: false,
      skippedReason: target.skippedReason,
    };
  }

  const db = getDb();
  if (!target.mediaId) {
    return {
      attempted: false,
      synced: false,
      skippedReason: "no_media_id",
    };
  }

  const mediaId = target.mediaId;
  const fallbackPublishedAt =
    target.latestHistory?.publishedAt ??
    row.publishedAt?.toISOString() ??
    undefined;

  try {
    const remoteState = await getInstagramMediaPublishState(
      mediaId,
      resolvedAuth.auth,
    );

    await markPostPublished(
      db,
      actor.ownerHash,
      row.id,
      remoteState.remoteObjectId,
      "instagram",
      {
        remotePermalink: remoteState.remotePermalink,
        publishedAt: remoteState.publishedAt ?? fallbackPublishedAt,
      },
    );

    await syncPublishedInstagramDestination(db, {
      postId: row.id,
      caption:
        target.destination?.caption ?? row.publishSettings?.caption ?? null,
      firstComment:
        target.destination?.firstComment ??
        row.publishSettings?.firstComment ??
        null,
      locationId:
        target.destination?.locationId ??
        row.publishSettings?.locationId ??
        null,
      userTags: target.destination?.userTags ?? null,
      remoteObjectId: remoteState.remoteObjectId,
      remoteContainerId: target.destination?.remoteContainerId ?? null,
      remotePermalink:
        remoteState.remotePermalink ??
        target.destination?.remotePermalink ??
        null,
      publishedAt: remoteState.publishedAt ?? fallbackPublishedAt,
    });

    return {
      attempted: true,
      synced: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const attemptedAt = new Date();

    await upsertPostDestinationRemoteState(db, {
      postId: row.id,
      destination: "instagram",
      enabled: target.destination?.enabled ?? true,
      syncMode: target.destination?.syncMode ?? "app_managed",
      desiredState: "published",
      remoteState: "out_of_sync",
      caption:
        target.destination?.caption ?? row.publishSettings?.caption ?? null,
      firstComment:
        target.destination?.firstComment ??
        row.publishSettings?.firstComment ??
        null,
      locationId:
        target.destination?.locationId ??
        row.publishSettings?.locationId ??
        null,
      userTags: target.destination?.userTags ?? null,
      publishAt:
        target.destination?.publishAt ??
        (fallbackPublishedAt ? new Date(fallbackPublishedAt) : null),
      remoteObjectId: mediaId,
      remoteContainerId: target.destination?.remoteContainerId ?? null,
      remotePermalink: target.destination?.remotePermalink ?? null,
      remoteStatePayload: {
        ...asRecord(target.destination?.remoteStatePayload),
        lastAttemptedSyncAt: attemptedAt.toISOString(),
      },
      lastSyncedAt: attemptedAt,
      lastError: message,
    });

    return {
      attempted: true,
      synced: false,
      error: message,
    };
  }
};
