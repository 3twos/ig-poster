import { z } from "zod";

import type { PostDestinationRow, PostRow } from "@/db/schema";
import { deriveTitle, toSummary } from "@/lib/post";
import { buildPostDestinationResources } from "@/lib/post-destinations";

export const PostStatusSchema = z.enum([
  "draft",
  "scheduled",
  "posted",
]);

export const PostSummaryResourceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: PostStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  assetCount: z.number().int().nonnegative(),
  variantCount: z.number().int().nonnegative(),
  thumbnail: z.string().optional(),
  destinations: z.array(
    z.object({
      destination: z.enum(["facebook", "instagram"]),
      enabled: z.boolean(),
      syncMode: z.enum(["remote_authoritative", "app_managed"]),
      desiredState: z.enum([
        "draft",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "canceled",
        "out_of_sync",
      ]),
      remoteState: z.enum([
        "draft",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "canceled",
        "out_of_sync",
      ]),
      caption: z.string().nullable(),
      firstComment: z.string().nullable(),
      locationId: z.string().nullable(),
      userTags: z.unknown().nullable(),
      publishAt: z.string().datetime().nullable(),
      remoteObjectId: z.string().nullable(),
      remoteContainerId: z.string().nullable(),
      remotePermalink: z.string().nullable(),
      lastSyncedAt: z.string().datetime().nullable(),
      lastError: z.string().nullable(),
    }),
  ),
});

export const PostResourceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: PostStatusSchema,
  brandKitId: z.string().nullable(),
  brief: z.unknown().nullable(),
  assets: z.array(z.unknown()),
  result: z.unknown().nullable(),
  renderedPosterUrl: z.string().nullable(),
  shareUrl: z.string().nullable(),
  activeVariantId: z.string().nullable(),
  mediaComposition: z.unknown().nullable(),
  publishSettings: z.unknown().nullable(),
  destinations: PostSummaryResourceSchema.shape.destinations,
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PostsListDataSchema = z.object({
  posts: z.array(PostSummaryResourceSchema),
});

export const PostDataSchema = z.object({
  post: PostResourceSchema,
});

export const PostMutationDataSchema = z.object({
  post: PostResourceSchema,
});

export const PostsListQuerySchema = z.object({
  archived: z.boolean().optional(),
  status: PostStatusSchema.optional(),
});

export const toPostSummaryResource = (
  row: PostRow,
  destinations?: PostDestinationRow[],
) => ({
  ...toSummary(row),
  destinations: buildPostDestinationResources(row, destinations),
});

export const toPostResource = (
  row: PostRow,
  destinations?: PostDestinationRow[],
) => ({
  id: row.id,
  title: deriveTitle(row),
  status: row.status,
  brandKitId: row.brandKitId ?? null,
  brief: row.brief ?? null,
  assets: row.assets ?? [],
  result: row.result ?? null,
  renderedPosterUrl: row.renderedPosterUrl ?? null,
  shareUrl: row.shareUrl ?? null,
  activeVariantId: row.activeVariantId ?? null,
  mediaComposition: row.mediaComposition ?? null,
  publishSettings: row.publishSettings ?? null,
  destinations: buildPostDestinationResources(row, destinations),
  archivedAt: row.archivedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
