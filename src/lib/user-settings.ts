import { z } from "zod";

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
    })
    .optional(),
  promptConfig: z
    .object({
      systemPrompt: z.string().optional(),
      customInstructions: z.string().optional(),
    })
    .optional(),
  logoUrl: z.string().url().optional(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

const sanitizeEmail = (email: string) =>
  email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, "")
    .replace(/[@.]/g, "-");

export const getUserSettingsPath = (email: string) =>
  `settings/users/${sanitizeEmail(email)}.json`;
