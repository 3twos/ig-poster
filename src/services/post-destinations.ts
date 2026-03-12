import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { postDestinations, type PostDestinationRow } from "@/db/schema";
import {
  META_DESTINATIONS,
  type MetaDestination,
  type MetaDestinationCapability,
} from "@/lib/meta-accounts";
import type { PublishSettings } from "@/lib/publish-settings";

type DbExecutor = Pick<ReturnType<typeof getDb>, "delete" | "insert" | "select">;
type PostInsertLike = {
  id: string;
  publishSettings?: PublishSettings | null;
};

const buildDestinationId = () => randomUUID().replace(/-/g, "").slice(0, 18);

const DEFAULT_DESTINATION_BEHAVIOR: Record<
  MetaDestination,
  Pick<MetaDestinationCapability, "syncMode">
> = {
  facebook: {
    syncMode: "remote_authoritative",
  },
  instagram: {
    syncMode: "app_managed",
  },
};

const seedDestination = (
  postId: string,
  destination: MetaDestination,
  publishSettings?: PublishSettings | null,
) => ({
  id: buildDestinationId(),
  postId,
  destination,
  enabled: destination === "instagram",
  syncMode: DEFAULT_DESTINATION_BEHAVIOR[destination].syncMode,
  desiredState: "draft" as const,
  remoteState: "draft" as const,
  caption: publishSettings?.caption ?? null,
  firstComment:
    destination === "instagram" ? publishSettings?.firstComment ?? null : null,
  locationId:
    destination === "instagram" ? publishSettings?.locationId ?? null : null,
  publishAt: null,
  remoteObjectId: null,
  remoteContainerId: null,
  remotePermalink: null,
  remoteStatePayload: {},
  lastSyncedAt: null,
  lastError: null,
});

export const buildDefaultPostDestinationSeeds = (
  post: PostInsertLike,
) => META_DESTINATIONS.map((destination) =>
  seedDestination(post.id, destination, post.publishSettings),
);

export const createDefaultPostDestinations = async (
  db: DbExecutor,
  post: PostInsertLike,
) => {
  await db.insert(postDestinations).values(buildDefaultPostDestinationSeeds(post));
};

export const clonePostDestinations = async (
  db: DbExecutor,
  sourcePost: PostInsertLike,
  duplicatedPost: PostInsertLike,
) => {
  const existing = await db
    .select()
    .from(postDestinations)
    .where(eq(postDestinations.postId, sourcePost.id));

  const byDestination = new Map(existing.map((row) => [row.destination, row]));
  const seeds = META_DESTINATIONS.map((destination) => {
    const row = byDestination.get(destination);
    if (!row) {
      return seedDestination(
        duplicatedPost.id,
        destination,
        duplicatedPost.publishSettings,
      );
    }

    return {
      id: buildDestinationId(),
      postId: duplicatedPost.id,
      destination,
      enabled: row.enabled,
      syncMode: row.syncMode,
      desiredState: "draft" as const,
      remoteState: "draft" as const,
      caption: row.caption,
      firstComment: row.firstComment,
      locationId: row.locationId,
      userTags: row.userTags,
      publishAt: null,
      remoteObjectId: null,
      remoteContainerId: null,
      remotePermalink: null,
      remoteStatePayload: {},
      lastSyncedAt: null,
      lastError: null,
    };
  });

  await db.insert(postDestinations).values(seeds);
};

export const deletePostDestinations = async (db: DbExecutor, postId: string) => {
  await db.delete(postDestinations).where(eq(postDestinations.postId, postId));
};

export const getStoredPostDestinations = async (
  postId: string,
): Promise<PostDestinationRow[]> => {
  const db = getDb();
  return db
    .select()
    .from(postDestinations)
    .where(eq(postDestinations.postId, postId));
};

export const listStoredPostDestinationsByPostId = async (
  postIds: string[],
): Promise<Map<string, PostDestinationRow[]>> => {
  const normalizedIds = [...new Set(postIds.map((postId) => postId.trim()).filter(Boolean))];
  const map = new Map<string, PostDestinationRow[]>();
  for (const postId of normalizedIds) {
    map.set(postId, []);
  }

  if (normalizedIds.length === 0) {
    return map;
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(postDestinations)
    .where(inArray(postDestinations.postId, normalizedIds));

  for (const row of rows) {
    const current = map.get(row.postId);
    if (current) {
      current.push(row);
      continue;
    }

    map.set(row.postId, [row]);
  }

  return map;
};
