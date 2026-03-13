import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { postDestinations, type PostDestinationRow } from "@/db/schema";
import {
  META_DESTINATIONS,
  type MetaDestination,
  type MetaDestinationCapability,
} from "@/lib/meta-accounts";
import type { MetaScheduleRequest } from "@/lib/meta-schemas";
import type { PublishSettings } from "@/lib/publish-settings";

type DbExecutor = Pick<
  ReturnType<typeof getDb>,
  "delete" | "insert" | "select" | "update"
>;
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

const buildLegacyPublishSettingsPatch = (
  destination: MetaDestination,
  publishSettings?: PublishSettings | null,
) => {
  const patch = {
    caption: publishSettings?.caption ?? null,
    firstComment: null as string | null,
    locationId: null as string | null,
    updatedAt: new Date(),
  };

  if (destination === "instagram") {
    patch.firstComment = publishSettings?.firstComment ?? null;
    patch.locationId = publishSettings?.locationId ?? null;
  }

  return patch;
};

type UpsertPostDestinationRemoteStateInput = {
  postId: string;
  destination: MetaDestination;
  enabled?: boolean;
  syncMode?: PostDestinationRow["syncMode"];
  desiredState: PostDestinationRow["desiredState"];
  remoteState: PostDestinationRow["remoteState"];
  caption?: string | null;
  firstComment?: string | null;
  locationId?: string | null;
  userTags?: MetaScheduleRequest["userTags"] | null;
  publishAt?: Date | null;
  remoteObjectId?: string | null;
  remoteContainerId?: string | null;
  remotePermalink?: string | null;
  remoteStatePayload?: Record<string, unknown>;
  lastSyncedAt?: Date | null;
  lastError?: string | null;
};

export const upsertPostDestinationRemoteState = async (
  db: DbExecutor,
  input: UpsertPostDestinationRemoteStateInput,
) => {
  const [existing] = await db
    .select()
    .from(postDestinations)
    .where(
      and(
        eq(postDestinations.postId, input.postId),
        eq(postDestinations.destination, input.destination),
      ),
    );

  const patch = {
    enabled: input.enabled ?? existing?.enabled ?? true,
    syncMode:
      input.syncMode ??
      existing?.syncMode ??
      DEFAULT_DESTINATION_BEHAVIOR[input.destination].syncMode,
    desiredState: input.desiredState,
    remoteState: input.remoteState,
    caption:
      input.caption !== undefined
        ? input.caption
        : (existing?.caption ?? null),
    firstComment:
      input.destination === "instagram"
        ? (
            input.firstComment !== undefined
              ? input.firstComment
              : (existing?.firstComment ?? null)
          )
        : null,
    locationId:
      input.destination === "instagram"
        ? (
            input.locationId !== undefined
              ? input.locationId
              : (existing?.locationId ?? null)
          )
        : null,
    userTags:
      input.destination === "instagram"
        ? (
            input.userTags !== undefined
              ? input.userTags
              : (existing?.userTags ?? null)
          )
        : null,
    publishAt:
      input.publishAt !== undefined
        ? input.publishAt
        : (existing?.publishAt ?? null),
    remoteObjectId:
      input.remoteObjectId !== undefined
        ? input.remoteObjectId
        : (existing?.remoteObjectId ?? null),
    remoteContainerId:
      input.remoteContainerId !== undefined
        ? input.remoteContainerId
        : (existing?.remoteContainerId ?? null),
    remotePermalink:
      input.remotePermalink !== undefined
        ? input.remotePermalink
        : (existing?.remotePermalink ?? null),
    remoteStatePayload:
      input.remoteStatePayload !== undefined
        ? input.remoteStatePayload
        : (existing?.remoteStatePayload ?? {}),
    lastSyncedAt:
      input.lastSyncedAt !== undefined
        ? input.lastSyncedAt
        : (existing?.lastSyncedAt ?? null),
    lastError:
      input.lastError !== undefined
        ? input.lastError
        : (existing?.lastError ?? null),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(postDestinations)
      .set(patch)
      .where(eq(postDestinations.id, existing.id));
    return;
  }

  await db.insert(postDestinations).values({
    ...seedDestination(input.postId, input.destination),
    ...patch,
  });
};

export const syncPostDestinationsFromPublishSettings = async (
  db: DbExecutor,
  post: PostInsertLike,
) => {
  const existing = await db
    .select()
    .from(postDestinations)
    .where(eq(postDestinations.postId, post.id));
  const existingDestinations = new Set(existing.map((row) => row.destination));
  const missingSeeds = META_DESTINATIONS.filter(
    (destination) => !existingDestinations.has(destination),
  ).map((destination) => seedDestination(post.id, destination, post.publishSettings));

  if (missingSeeds.length > 0) {
    await db.insert(postDestinations).values(missingSeeds);
  }

  for (const destination of existingDestinations) {
    await db
      .update(postDestinations)
      .set(buildLegacyPublishSettingsPatch(destination, post.publishSettings))
      .where(
        and(
          eq(postDestinations.postId, post.id),
          eq(postDestinations.destination, destination),
        ),
      );
  }
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
