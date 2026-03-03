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

type StructuredGenerationOptions = {
  auth: ResolvedLlmAuth;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens?: number;
};

const unwrapMarkdownJson = (value: string) =>
  value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
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
  const next = Number.isFinite(value) ? Math.round(value as number) : fallback;
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
