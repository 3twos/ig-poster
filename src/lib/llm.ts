import OpenAI from "openai";
import { z } from "zod";

export const LlmProviderSchema = z.enum(["openai", "anthropic"]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

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

const generateWithAnthropic = async (options: StructuredGenerationOptions) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": options.auth.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: options.auth.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2400,
      temperature: options.temperature,
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userPrompt }],
    }),
    cache: "no-store",
  });

  const json = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };

  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? `Anthropic request failed (${response.status})`);
  }

  const text = json.content?.find((part) => part.type === "text")?.text;
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
