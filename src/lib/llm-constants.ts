import { z } from "zod";

export const LlmProviderSchema = z.enum(["openai", "anthropic"]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-6";

export const PROVIDER_DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: DEFAULT_OPENAI_MODEL,
  anthropic: DEFAULT_ANTHROPIC_MODEL,
};
