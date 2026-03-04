import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import type { ResolvedLlmAuth } from "@/lib/llm";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "@/lib/llm-constants";
import type { ChatStreamEvent } from "@/lib/chat-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatStreamCallbacks = {
  onToken: (content: string) => void;
  onDone: (tokenCount?: number) => void;
  onError: (detail: string) => void;
};

export type ChatStreamOptions = ChatStreamCallbacks & {
  auth: ResolvedLlmAuth;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// SSE serialisation
// ---------------------------------------------------------------------------

export const toChatSseEvent = (event: ChatStreamEvent): string =>
  `data: ${JSON.stringify(event)}\n\n`;

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

const clampTemperature = (t: number) => Math.max(0, Math.min(2, t));

async function streamOpenAI(options: ChatStreamOptions): Promise<void> {
  const client = new OpenAI({ apiKey: options.auth.apiKey });
  const model = options.auth.model || DEFAULT_OPENAI_MODEL;

  const stream = await client.chat.completions.create(
    {
      model,
      temperature: clampTemperature(options.temperature),
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: options.maxTokens ?? 4096,
      messages: [
        { role: "system" as const, content: options.systemPrompt },
        ...options.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    },
    { signal: options.signal },
  );

  let outputTokens: number | undefined;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      options.onToken(delta);
    }
    if (chunk.usage?.completion_tokens) {
      outputTokens = chunk.usage.completion_tokens;
    }
  }

  options.onDone(outputTokens);
}

// ---------------------------------------------------------------------------
// Anthropic streaming
// ---------------------------------------------------------------------------

const ANTHROPIC_TIMEOUT_MS = 90_000;

async function streamAnthropic(options: ChatStreamOptions): Promise<void> {
  const client = new Anthropic({ apiKey: options.auth.apiKey });
  const model = options.auth.model || DEFAULT_ANTHROPIC_MODEL;
  const maxTokens = options.maxTokens ?? 4096;

  const stream = client.messages.stream(
    {
      model,
      max_tokens: Math.max(256, maxTokens),
      temperature: Math.max(0, Math.min(1, options.temperature)),
      system: options.systemPrompt,
      messages: options.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    },
    { signal: options.signal, timeout: ANTHROPIC_TIMEOUT_MS },
  );

  stream.on("text", (text) => {
    options.onToken(text);
  });

  const finalMessage = await stream.finalMessage();
  options.onDone(finalMessage.usage.output_tokens);
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

export async function streamChatCompletion(
  options: ChatStreamOptions,
): Promise<void> {
  if (options.auth.provider === "anthropic") {
    return streamAnthropic(options);
  }
  return streamOpenAI(options);
}
