import { z } from "zod";

import {
  BrandInputSchema,
  GenerationResponseSchema,
  OverlayLayoutSchema,
  PostInputSchema,
} from "@/lib/creative";

export const StoredAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160),
  url: z.string().url(),
});

export const SavedProjectPayloadSchema = z.object({
  brand: BrandInputSchema,
  post: PostInputSchema,
  assets: z.array(StoredAssetSchema).max(20),
  logoUrl: z.string().url().optional().default(""),
  result: GenerationResponseSchema,
  activeVariantId: z.string().trim().min(1),
  overlayLayouts: z.record(z.string(), OverlayLayoutSchema).default({}),
  renderedPosterUrl: z.string().url().optional().default(""),
});

export const SavedProjectSchema = SavedProjectPayloadSchema.extend({
  id: z.string().trim().min(1),
  createdAt: z.string().datetime(),
});

export type StoredAsset = z.infer<typeof StoredAssetSchema>;
export type SavedProjectPayload = z.infer<typeof SavedProjectPayloadSchema>;
export type SavedProject = z.infer<typeof SavedProjectSchema>;
