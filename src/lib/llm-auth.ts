import { z } from "zod";

import { decryptString, encryptString } from "@/lib/secure";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  LlmProviderSchema,
  type ResolvedLlmAuth,
} from "@/lib/llm";

export const LLM_CONNECTION_COOKIE = "ig_llm_connection";

const LlmConnectionSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(400),
  updatedAt: z.string().datetime(),
});

export type LlmConnectionPayload = z.infer<typeof LlmConnectionSchema>;

const getEncryptionSecret = () =>
  process.env.APP_ENCRYPTION_SECRET || process.env.META_APP_SECRET || "";

const readCookieFromHeader = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) {
    return "";
  }

  const match = cookieHeader
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${key}=`));

  if (!match) {
    return "";
  }

  return decodeURIComponent(match.slice(key.length + 1));
};

export const readCookieFromRequest = (req: Request, key: string) =>
  readCookieFromHeader(req.headers.get("cookie"), key);

export const buildEncryptedLlmConnection = (input: {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
}) => {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error("APP_ENCRYPTION_SECRET is required to store connected LLM keys.");
  }

  const payload = LlmConnectionSchema.parse({
    provider: input.provider,
    model:
      (input.model || "").trim() ||
      (input.provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL),
    apiKey: input.apiKey.trim(),
    updatedAt: new Date().toISOString(),
  });

  return encryptString(JSON.stringify(payload), secret);
};

export const readLlmConnectionFromRequest = (req: Request): LlmConnectionPayload | null => {
  const encrypted = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
  if (!encrypted) {
    return null;
  }

  const secret = getEncryptionSecret();
  if (!secret) {
    return null;
  }

  try {
    const json = decryptString(encrypted, secret);
    return LlmConnectionSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
};

export const resolveLlmAuthFromRequest = (req: Request): ResolvedLlmAuth | null => {
  const connection = readLlmConnectionFromRequest(req);
  if (connection) {
    return {
      source: "connection",
      provider: connection.provider,
      model: connection.model,
      apiKey: connection.apiKey,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      source: "env",
      provider: "openai",
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
    };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    return {
      source: "env",
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      apiKey: anthropicKey,
    };
  }

  return null;
};
