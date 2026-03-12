import { z } from "zod";

import {
  BrandInputSchema,
  CreativeVariantSchema,
  GenerationRequestSchema,
  OverlayLayoutSchema,
  PostInputSchema,
} from "@/lib/creative";

export const GenerateRunBodySchema = z.union([
  z.object({
    postId: z.string().trim().min(1),
  }).strict(),
  z.object({
    request: GenerationRequestSchema,
  }).strict(),
  GenerationRequestSchema.strict(),
]);

export type GenerateRunBody = z.infer<typeof GenerateRunBodySchema>;

export const GenerateRefineBodySchema = z.union([
  z.object({
    postId: z.string().trim().min(1),
    instruction: z.string().trim().min(3).max(500),
    variantId: z.string().trim().min(1).optional(),
  }).strict(),
  z.object({
    variant: CreativeVariantSchema,
    instruction: z.string().trim().min(3).max(500),
    brand: BrandInputSchema,
    post: PostInputSchema.optional(),
    promptConfig: z.object({
      systemPrompt: z.string().trim().max(2000).optional(),
      customInstructions: z.string().trim().max(4000).optional(),
    }).optional(),
    overlayLayout: OverlayLayoutSchema.optional(),
  }).strict(),
]);

export type GenerateRefineBody = z.infer<typeof GenerateRefineBodySchema>;
