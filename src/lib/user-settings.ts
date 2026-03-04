import { createHash } from "crypto";

import { z } from "zod";

import { MultiModelModeSchema } from "@/lib/llm-constants";

export const UserSettingsSchema = z.object({
  email: z.string().email(),
  updatedAt: z.string().datetime(),
  brand: z
    .object({
      brandName: z.string().optional(),
      website: z.string().optional(),
      values: z.string().optional(),
      principles: z.string().optional(),
      story: z.string().optional(),
      voice: z.string().optional(),
      visualDirection: z.string().optional(),
      palette: z.string().optional(),
      logoNotes: z.string().optional(),
    })
    .optional(),
  aiConfig: z
    .object({
      provider: z.enum(["openai", "anthropic"]).optional(),
      model: z.string().optional(),
      mode: MultiModelModeSchema.optional(),
      connectionOrder: z.array(z.string()).optional(),
    })
    .optional(),
  promptConfig: z
    .object({
      systemPrompt: z.string().optional(),
      customInstructions: z.string().optional(),
    })
    .optional(),
  logoUrl: z.string().url().optional(),
  brandMemory: z
    .object({
      websiteUrl: z.string().optional(),
      bodyText: z.string().optional(),
      notes: z.string().optional(),
      fetchedAt: z.string().datetime().optional(),
    })
    .optional(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export const getUserSettingsPath = (email: string) =>
  `settings/users/${hashEmail(email)}.json`;
