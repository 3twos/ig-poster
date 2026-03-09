import { z } from "zod";

import {
  AspectRatioSchema,
  GenerationResponseSchema,
  OverlayLayoutSchema,
} from "@/lib/creative";
import { MediaCompositionSchema } from "@/lib/media-composer";
import { PublishSettingsSchema } from "@/lib/publish-settings";
import { StoredAssetSchema } from "@/lib/project";

export const PostStatusSchema = z.enum([
  "draft",
  "generated",
  "published",
  "scheduled",
  "archived",
]);

const DraftBrandSchema = z.object({
  brandName: z.string().max(80).optional(),
  website: z.string().max(240).optional(),
  values: z.string().max(1200).optional(),
  principles: z.string().max(1200).optional(),
  story: z.string().max(1800).optional(),
  voice: z.string().max(600).optional(),
  visualDirection: z.string().max(1200).optional(),
  palette: z.string().max(200).optional(),
  logoNotes: z.string().max(300).optional(),
});

const DraftBriefSchema = z.object({
  theme: z.string().max(200).optional(),
  subject: z.string().max(200).optional(),
  thought: z.string().max(500).optional(),
  objective: z.string().max(220).optional(),
  audience: z.string().max(220).optional(),
  mood: z.string().max(120).optional(),
  aspectRatio: AspectRatioSchema.optional(),
});

const PromptConfigSchema = z.object({
  systemPrompt: z.string().max(2000).optional(),
  customInstructions: z.string().max(4000).optional(),
});

const PublishHistoryEntrySchema = z.object({
  publishedAt: z.string().datetime(),
  igMediaId: z.string().max(120).optional(),
  igPermalink: z.string().url().optional(),
});

const NullishUrlSchema = z.union([z.string().url(), z.null()]);

export const PostCreateRequestSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    brand: DraftBrandSchema.nullish(),
    brief: DraftBriefSchema.nullish(),
    assets: z.array(StoredAssetSchema).max(20).optional(),
    logoUrl: NullishUrlSchema.optional(),
    brandKitId: z.union([z.string().trim().max(18), z.null()]).optional(),
    promptConfig: PromptConfigSchema.nullish(),
    mediaComposition: MediaCompositionSchema.nullish(),
    publishSettings: PublishSettingsSchema.nullish(),
  })
  .passthrough();

export type PostCreateRequest = z.infer<typeof PostCreateRequestSchema>;

export const PostUpdateRequestSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    status: PostStatusSchema.optional(),
    logoUrl: NullishUrlSchema.optional(),
    activeVariantId: z.union([z.string().trim().max(64), z.null()]).optional(),
    renderedPosterUrl: NullishUrlSchema.optional(),
    shareUrl: NullishUrlSchema.optional(),
    shareProjectId: z.union([z.string().trim().max(36), z.null()]).optional(),
    brandKitId: z.union([z.string().trim().max(18), z.null()]).optional(),
    brand: DraftBrandSchema.nullish(),
    brief: DraftBriefSchema.nullish(),
    promptConfig: PromptConfigSchema.nullish(),
    overlayLayouts: z.record(z.string(), OverlayLayoutSchema).nullish(),
    mediaComposition: MediaCompositionSchema.nullish(),
    publishSettings: PublishSettingsSchema.nullish(),
    assets: z.array(StoredAssetSchema).max(20).optional(),
    result: GenerationResponseSchema.nullish(),
    publishHistory: z.array(PublishHistoryEntrySchema).max(200).optional(),
  })
  .passthrough();

export type PostUpdateRequest = z.infer<typeof PostUpdateRequestSchema>;
