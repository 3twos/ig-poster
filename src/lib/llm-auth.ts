import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  deleteBlobByPath,
  isBlobEnabled,
  putJson,
  readJsonByPath,
} from "@/lib/blob-store";
import { getAppEncryptionSecret } from "@/lib/app-encryption";
import { readCookieFromRequest } from "@/lib/cookies";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type LlmProvider,
  LlmProviderSchema,
} from "@/lib/llm-constants";
import { type ResolvedLlmAuth } from "@/lib/llm";
import { decryptString, encryptString } from "@/lib/secure";

export const LLM_CONNECTION_COOKIE = "ig_llm_connection";
const INLINE_CONNECTION_PREFIX = "inline:";

export const LlmConnectionSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(120),
  encryptedApiKey: z.string().min(12),
});

export type LlmConnection = z.infer<typeof LlmConnectionSchema>;
type InlineLlmConnection = {
  provider: LlmProvider;
  model: string;
  apiKey: string;
};

const InlineLlmConnectionSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(8).max(400),
});

type SavedLlmConnection = {
  storage: "blob" | "cookie";
  cookieValue: string;
  provider: LlmProvider;
  model: string;
};

const parseConnectionCookie = (cookieValue: string) => {
  const value = cookieValue.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith(INLINE_CONNECTION_PREFIX)) {
    const encryptedPayload = value.slice(INLINE_CONNECTION_PREFIX.length).trim();
    if (!encryptedPayload) {
      return null;
    }
    return { kind: "inline" as const, encryptedPayload };
  }

  return { kind: "blob" as const, id: value };
};

const getConnectionPath = (id: string) => `auth/llm/connections/${id}.json`;

const decodeInlineConnection = (encryptedPayload: string): InlineLlmConnection => {
  const secret = getAppEncryptionSecret();
  if (!secret) {
    throw new Error(
      "Missing APP_ENCRYPTION_SECRET, META_APP_SECRET, or WORKSPACE_AUTH_SECRET in production",
    );
  }

  const decrypted = decryptString(encryptedPayload, secret);
  const parsed = InlineLlmConnectionSchema.safeParse(JSON.parse(decrypted));
  if (!parsed.success) {
    throw new Error("Invalid inline LLM connection payload");
  }

  return parsed.data;
};

const decryptConnectionApiKey = (connection: LlmConnection) => {
  const secret = getAppEncryptionSecret();
  if (!secret) {
    throw new Error(
      "Missing APP_ENCRYPTION_SECRET, META_APP_SECRET, or WORKSPACE_AUTH_SECRET in production",
    );
  }

  return decryptString(connection.encryptedApiKey, secret);
};

export const saveLlmConnection = async (input: {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
}): Promise<SavedLlmConnection> => {
  const secret = getAppEncryptionSecret();
  if (!secret) {
    throw new Error(
      "APP_ENCRYPTION_SECRET, META_APP_SECRET, or WORKSPACE_AUTH_SECRET is required in production.",
    );
  }

  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
  const model =
    (input.model || "").trim() ||
    (input.provider === "anthropic"
      ? DEFAULT_ANTHROPIC_MODEL
      : DEFAULT_OPENAI_MODEL);

  if (isBlobEnabled()) {
    const record = LlmConnectionSchema.parse({
      id,
      createdAt: now,
      updatedAt: now,
      provider: input.provider,
      model,
      encryptedApiKey: encryptString(input.apiKey.trim(), secret),
    });

    await putJson(getConnectionPath(record.id), record);
    return {
      storage: "blob",
      cookieValue: record.id,
      provider: record.provider,
      model: record.model,
    };
  }

  const inline = InlineLlmConnectionSchema.parse({
    provider: input.provider,
    model,
    apiKey: input.apiKey.trim(),
  });
  const encryptedInline = encryptString(JSON.stringify(inline), secret);

  if (encryptedInline.length > 3500) {
    throw new Error("Connected key is too large for cookie fallback storage.");
  }

  return {
    storage: "cookie",
    cookieValue: `${INLINE_CONNECTION_PREFIX}${encryptedInline}`,
    provider: inline.provider,
    model: inline.model,
  };
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
  if (id.startsWith(INLINE_CONNECTION_PREFIX)) {
    return false;
  }

  if (!isBlobEnabled()) {
    return false;
  }

  return deleteBlobByPath(getConnectionPath(id));
};

export const readLlmConnectionFromRequest = async (req: Request) => {
  const connectionCookie = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
  const parsedConnection = parseConnectionCookie(connectionCookie);
  if (!parsedConnection || parsedConnection.kind !== "blob" || !isBlobEnabled()) {
    return null;
  }

  return getLlmConnection(parsedConnection.id);
};

export const getBlobConnectionIdFromCookie = (cookieValue: string) => {
  const parsedConnection = parseConnectionCookie(cookieValue);
  if (!parsedConnection || parsedConnection.kind !== "blob") {
    return "";
  }

  return parsedConnection.id;
};

export const resolveLlmAuthFromRequest = async (
  req: Request,
): Promise<ResolvedLlmAuth | null> => {
  const connectionCookie = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
  const parsedConnection = parseConnectionCookie(connectionCookie);

  if (parsedConnection?.kind === "inline") {
    try {
      const inline = decodeInlineConnection(parsedConnection.encryptedPayload);
      return {
        source: "connection",
        provider: inline.provider,
        model: inline.model,
        apiKey: inline.apiKey,
      };
    } catch {
      // Fall through to env credentials if cookie payload is stale/invalid.
    }
  }

  if (parsedConnection?.kind === "blob" && isBlobEnabled()) {
    try {
      const connection = await getLlmConnection(parsedConnection.id);
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
