import { z } from "zod";

import type { PostRow } from "@/db/schema";
import { deriveTitle, toSummary } from "@/lib/post";

export const PostStatusSchema = z.enum([
  "draft",
  "generated",
  "published",
  "scheduled",
  "archived",
]);

export const PostSummaryResourceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: PostStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  assetCount: z.number().int().nonnegative(),
  variantCount: z.number().int().nonnegative(),
  thumbnail: z.string().optional(),
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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PostsListDataSchema = z.object({
  posts: z.array(PostSummaryResourceSchema),
});

export const PostDataSchema = z.object({
  post: PostResourceSchema,
});

export const PostsListQuerySchema = z.object({
  archived: z.boolean().optional(),
  status: PostStatusSchema.optional(),
});

export const toPostSummaryResource = (row: PostRow) => toSummary(row);

export const toPostResource = (row: PostRow) => ({
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
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
