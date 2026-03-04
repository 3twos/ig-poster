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
  signal?: AbortSignal;
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
  const model = options.auth.model || DEFAULT_OPENAI_MODEL;

  console.log(
    `[llm] OpenAI request: model=${model}, ` +
      `systemLen=${options.systemPrompt.length}, userLen=${options.userPrompt.length}`,
  );
  const t0 = Date.now();

  const completion = await client.chat.completions.create(
    {
      model,
      temperature: options.temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
    },
    { signal: options.signal },
  );

  const elapsed = Date.now() - t0;
  console.log(
    `[llm] OpenAI response: ${elapsed}ms, ` +
      `usage=${JSON.stringify(completion.usage)}`,
  );

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

const ANTHROPIC_REQUEST_TIMEOUT_MS = 45_000;

const generateWithAnthropic = async (options: StructuredGenerationOptions) => {
  const client = new Anthropic({ apiKey: options.auth.apiKey });
  const maxTokens = resolveAnthropicMaxTokens(options.maxTokens);
  const model = options.auth.model || DEFAULT_ANTHROPIC_MODEL;

  console.log(
    `[llm] Anthropic request: model=${model}, maxTokens=${maxTokens}, ` +
      `systemLen=${options.systemPrompt.length}, userLen=${options.userPrompt.length}`,
  );
  const t0 = Date.now();

  const message = await client.messages.create(
    {
      model,
      max_tokens: maxTokens,
      temperature: clampAnthropicTemperature(options.temperature),
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userPrompt }],
    },
    { signal: options.signal, timeout: ANTHROPIC_REQUEST_TIMEOUT_MS },
  );

  const elapsed = Date.now() - t0;
  console.log(
    `[llm] Anthropic response: ${elapsed}ms, ` +
      `inputTokens=${message.usage.input_tokens}, outputTokens=${message.usage.output_tokens}, ` +
      `stopReason=${message.stop_reason}`,
  );

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

type StreamingGenerationOptions = StructuredGenerationOptions & {
  onChunk?: (text: string) => void;
};

// NOTE: Anthropic thinking tokens (`thinking_delta` events) only fire when the
// `thinking` parameter is explicitly enabled in the API request. Without it,
// `onChunk` is only called for OpenAI reasoning tokens. Enabling extended
// thinking requires a `thinking: { type: "enabled", budget_tokens: N }` param,
// which increases cost and latency — left as a future opt-in.
const streamWithAnthropic = async (options: StreamingGenerationOptions) => {
  const client = new Anthropic({ apiKey: options.auth.apiKey });
  const maxTokens = resolveAnthropicMaxTokens(options.maxTokens);
  const model = options.auth.model || DEFAULT_ANTHROPIC_MODEL;

  console.log(
    `[llm] Anthropic streaming request: model=${model}, maxTokens=${maxTokens}, ` +
      `systemLen=${options.systemPrompt.length}, userLen=${options.userPrompt.length}`,
  );
  const t0 = Date.now();
  let fullText = "";

  const stream = client.messages.stream(
    {
      model,
      max_tokens: maxTokens,
      temperature: clampAnthropicTemperature(options.temperature),
      system: options.systemPrompt,
      messages: [{ role: "user", content: options.userPrompt }],
    },
    { signal: options.signal, timeout: ANTHROPIC_REQUEST_TIMEOUT_MS },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const delta = event.delta;
      if ("thinking" in delta && typeof delta.thinking === "string") {
        options.onChunk?.(delta.thinking);
      } else if (delta.type === "text_delta") {
        fullText += delta.text;
      }
    }
  }

  const finalMessage = await stream.finalMessage();
  const elapsed = Date.now() - t0;
  console.log(
    `[llm] Anthropic streaming response: ${elapsed}ms, ` +
      `inputTokens=${finalMessage.usage.input_tokens}, outputTokens=${finalMessage.usage.output_tokens}, ` +
      `stopReason=${finalMessage.stop_reason}`,
  );

  if (!fullText) {
    fullText = finalMessage.content
      .filter((part): part is Anthropic.TextBlock => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }

  if (!fullText) {
    throw new Error("Anthropic streaming response was empty");
  }

  return fullText;
};

const streamWithOpenAI = async (options: StreamingGenerationOptions) => {
  const client = new OpenAI({ apiKey: options.auth.apiKey });
  const model = options.auth.model || DEFAULT_OPENAI_MODEL;

  console.log(
    `[llm] OpenAI streaming request: model=${model}, ` +
      `systemLen=${options.systemPrompt.length}, userLen=${options.userPrompt.length}`,
  );
  const t0 = Date.now();
  let fullText = "";

  const stream = await client.chat.completions.create(
    {
      model,
      temperature: options.temperature,
      response_format: { type: "json_object" },
      stream: true,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
    },
    { signal: options.signal },
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      fullText += delta.content;
    }
    if (delta && "reasoning_content" in delta && typeof delta.reasoning_content === "string") {
      options.onChunk?.(delta.reasoning_content);
    }
  }

  const elapsed = Date.now() - t0;
  console.log(`[llm] OpenAI streaming response: ${elapsed}ms`);

  if (!fullText) {
    throw new Error("OpenAI streaming response was empty");
  }

  return fullText;
};

export const streamStructuredJsonWithCallback = async <T>(
  options: StreamingGenerationOptions,
): Promise<T> => {
  const raw =
    options.auth.provider === "anthropic"
      ? await streamWithAnthropic(options)
      : await streamWithOpenAI(options);

  return parseJsonObject<T>(raw);
};
