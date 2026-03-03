import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  deleteBlobByPath,
  isBlobEnabled,
  putJson,
  readJsonByPath,
} from "@/lib/blob-store";
import { readCookieFromRequest } from "@/lib/cookies";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  LlmProviderSchema,
} from "@/lib/llm-constants";
import { type ResolvedLlmAuth } from "@/lib/llm";
import { decryptString, encryptString } from "@/lib/secure";

export const LLM_CONNECTION_COOKIE = "ig_llm_connection";

export const LlmConnectionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(120),
  encryptedApiKey: z.string().min(12),
});

export type LlmConnection = z.infer<typeof LlmConnectionSchema>;

const getEncryptionSecret = () =>
  process.env.APP_ENCRYPTION_SECRET || process.env.META_APP_SECRET || "";

const getConnectionPath = (id: string) => `auth/llm/connections/${id}.json`;

const decryptConnectionApiKey = (connection: LlmConnection) => {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error("Missing APP_ENCRYPTION_SECRET or META_APP_SECRET");
  }

  return decryptString(connection.encryptedApiKey, secret);
};

export const saveLlmConnection = async (input: {
  provider: "openai" | "anthropic";
  apiKey: string;
  model?: string;
}) => {
  if (!isBlobEnabled()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required to store connected LLM keys.");
  }

  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error("APP_ENCRYPTION_SECRET (or META_APP_SECRET) is required.");
  }

  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
  const model =
    (input.model || "").trim() ||
    (input.provider === "anthropic"
      ? DEFAULT_ANTHROPIC_MODEL
      : DEFAULT_OPENAI_MODEL);

  const record = LlmConnectionSchema.parse({
    id,
    createdAt: now,
    updatedAt: now,
    provider: input.provider,
    model,
    encryptedApiKey: encryptString(input.apiKey.trim(), secret),
  });

  await putJson(getConnectionPath(record.id), record);
  return record;
};

export const getLlmConnection = async (id: string) => {
  if (!isBlobEnabled()) {
    return null;
  }

  const record = await readJsonByPath<unknown>(getConnectionPath(id));
  if (!record) {
    return null;
  }

  const parsed = LlmConnectionSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
};

export const deleteLlmConnection = async (id: string) => {
  if (!isBlobEnabled()) {
    return false;
  }

  return deleteBlobByPath(getConnectionPath(id));
};

export const readLlmConnectionFromRequest = async (req: Request) => {
  const connectionId = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
  if (!connectionId || !isBlobEnabled()) {
    return null;
  }

  return getLlmConnection(connectionId);
};

export const resolveLlmAuthFromRequest = async (
  req: Request,
): Promise<ResolvedLlmAuth | null> => {
  const connectionId = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
  if (connectionId && isBlobEnabled()) {
    try {
      const connection = await getLlmConnection(connectionId);
      if (connection) {
        return {
          source: "connection",
          provider: connection.provider,
          model: connection.model,
          apiKey: decryptConnectionApiKey(connection),
        };
      }
    } catch {
      // Fall through to env credentials if connection record is stale/invalid.
    }
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
