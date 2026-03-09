import { z } from "zod";

import {
  BrandInputSchema,
  CreativeVariantSchema,
  GenerationRequestSchema,
} from "@/lib/creative";

export const GenerateRunBodySchema = z.union([
  z.object({
    postId: z.string().trim().min(1),
  }),
  z.object({
    request: GenerationRequestSchema,
  }),
  GenerationRequestSchema,
]);

export type GenerateRunBody = z.infer<typeof GenerateRunBodySchema>;

export const GenerateRefineBodySchema = z.union([
  z.object({
    postId: z.string().trim().min(1),
    instruction: z.string().trim().min(3).max(500),
    variantId: z.string().trim().min(1).optional(),
  }),
  z.object({
    variant: CreativeVariantSchema,
    instruction: z.string().trim().min(3).max(500),
    brand: BrandInputSchema,
  }),
]);

export type GenerateRefineBody = z.infer<typeof GenerateRefineBodySchema>;
