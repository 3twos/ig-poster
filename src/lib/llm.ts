import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type LlmProvider,
} from "@/lib/llm-constants";

export type ResolvedLlmAuth = {
  source: "connection" | "env";
  provider: LlmProvider;
  model: string;
  apiKey: string;
};

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected provider validation failure";

const selectFallbackModel = (
  availableModels: string[],
  preferredModel: string,
  defaultModel: string,
) => {
  if (availableModels.includes(preferredModel)) {
    return preferredModel;
  }

  if (availableModels.includes(defaultModel)) {
    return defaultModel;
  }

  return availableModels[0] || preferredModel;
};

export const validateLlmCredentials = async (params: {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}): Promise<string> => {
  if (params.provider === "anthropic") {
    const client = new Anthropic({ apiKey: params.apiKey });
    const timeoutMs = 12_000;

    try {
      await client.models.retrieve(params.model, undefined, { timeout: timeoutMs });
      return params.model;
    } catch {
      try {
        const page = await client.models.list(undefined, { timeout: timeoutMs });
        const available = page.data.map((model) => model.id).filter(Boolean);
        if (!available.length) {
          throw new Error("No Anthropic models are available for this key.");
        }

        return selectFallbackModel(
          available,
          params.model,
          DEFAULT_ANTHROPIC_MODEL,
        );
      } catch (fallbackError) {
        throw new Error(`Anthropic credential validation failed: ${toErrorMessage(fallbackError)}`);
      }
    }
  }

  const client = new OpenAI({ apiKey: params.apiKey });
  const timeoutMs = 12_000;

  try {
    await client.models.retrieve(params.model, { timeout: timeoutMs });
    return params.model;
  } catch {
    try {
      const page = await client.models.list({ timeout: timeoutMs });
      const available = page.data.map((model) => model.id).filter(Boolean);
      if (!available.length) {
        throw new Error("No OpenAI models are available for this key.");
      }

      return selectFallbackModel(available, params.model, DEFAULT_OPENAI_MODEL);
    } catch (fallbackError) {
      throw new Error(`OpenAI credential validation failed: ${toErrorMessage(fallbackError)}`);
    }
  }
};

type StructuredGenerationOptions = {
  auth: ResolvedLlmAuth;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
};

const unwrapMarkdownJson = (value: string) =>
  value
    .replace(/^[\s\S]*?```json\s*/i, "")
    .replace(/^[\s\S]*?```\s*/i, "")
    .replace(/\s*```[\s\S]*$/i, "")
    .trim();

const parseJsonObject = <T>(value: string): T => {
  const direct = unwrapMarkdownJson(value);
  try {
    return JSON.parse(direct) as T;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as T;
    }
    throw new Error("Model did not return valid JSON");
  }
};

const generateWithOpenAI = async (options: StructuredGenerationOptions) => {
  const client = new OpenAI({ apiKey: options.auth.apiKey });
  const completion = await client.chat.completions.create({
    model: options.auth.model || DEFAULT_OPENAI_MODEL,
    temperature: options.temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI response was empty");
  }

  return content;
};

const clampAnthropicTemperature = (temperature: number) =>
  Math.max(0, Math.min(1, temperature));

const resolveAnthropicMaxTokens = (value?: number) => {
  const fallback = 8192;
  const next = value !== undefined && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(256, next);
};

const generateWithAnthropic = async (options: StructuredGenerationOptions) => {
  const client = new Anthropic({ apiKey: options.auth.apiKey });
  const message = await client.messages.create({
    model: options.auth.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: resolveAnthropicMaxTokens(options.maxTokens),
    temperature: clampAnthropicTemperature(options.temperature),
    system: options.systemPrompt,
    messages: [{ role: "user", content: options.userPrompt }],
  });

  const text = message.content
    .filter((part): part is Anthropic.TextBlock => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic response was empty");
  }

  return text;
};

export const generateStructuredJson = async <T>(
  options: StructuredGenerationOptions,
): Promise<T> => {
  const raw =
    options.auth.provider === "anthropic"
      ? await generateWithAnthropic(options)
      : await generateWithOpenAI(options);

  return parseJsonObject<T>(raw);
};
