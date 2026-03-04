import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  deleteCredentialRecord,
  type CredentialNamespace,
  isCredentialStoreEnabled,
  listCredentialRecords,
  putCredentialRecord,
  readCredentialRecord,
} from "@/lib/private-credential-store";
import { requireAppEncryptionSecret } from "@/lib/app-encryption";
import { readJsonByPath } from "@/lib/blob-store";
import { readCookieFromRequest } from "@/lib/cookies";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type LlmProvider,
  LlmProviderSchema,
  type MultiModelMode,
} from "@/lib/llm-constants";
import { type ResolvedLlmAuth, type ResolvedLlmAuthList } from "@/lib/llm";
import { decryptString, encryptString } from "@/lib/secure";
import {
  getUserSettingsPath,
  type UserSettings,
} from "@/lib/user-settings";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const LLM_CONNECTION_COOKIE = "ig_llm_connection";
const INLINE_CONNECTION_PREFIX = "inline:";
const LLM_CONNECTION_NAMESPACE: CredentialNamespace = "llm";

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

export type SavedLlmConnection = {
  storage: "database" | "cookie";
  cookieValue: string;
  connectionId: string;
  provider: LlmProvider;
  model: string;
};

type ParsedCookieResult =
  | { kind: "empty" }
  | { kind: "inline"; encryptedPayload: string }
  | { kind: "stored"; id: string }
  | { kind: "multi-stored"; ids: string[] };

export const parseConnectionCookie = (cookieValue: string): ParsedCookieResult => {
  const value = cookieValue.trim();
  if (!value) {
    return { kind: "empty" };
  }

  // Multi-model JSON array format: ["id1","id2"]
  if (value.startsWith("[")) {
    try {
      const ids = JSON.parse(value) as unknown;
      if (
        Array.isArray(ids) &&
        ids.every((id) => typeof id === "string" && id.length > 0)
      ) {
        return { kind: "multi-stored", ids: ids as string[] };
      }
    } catch {
      // Fall through to legacy formats
    }
  }

  // Legacy inline connection
  if (value.startsWith(INLINE_CONNECTION_PREFIX)) {
    const encryptedPayload = value.slice(INLINE_CONNECTION_PREFIX.length).trim();
    if (!encryptedPayload) {
      return { kind: "empty" };
    }
    return { kind: "inline", encryptedPayload };
  }

  // Legacy single stored ID
  return { kind: "stored", id: value };
};

const decodeInlineConnection = (encryptedPayload: string): InlineLlmConnection => {
  const secret = requireAppEncryptionSecret();

  const decrypted = decryptString(encryptedPayload, secret);
  const parsed = InlineLlmConnectionSchema.safeParse(JSON.parse(decrypted));
  if (!parsed.success) {
    throw new Error("Invalid inline LLM connection payload");
  }

  return parsed.data;
};

const decryptConnectionApiKey = (connection: LlmConnection) => {
  const secret = requireAppEncryptionSecret();

  return decryptString(connection.encryptedApiKey, secret);
};

export const saveLlmConnection = async (input: {
  provider: LlmProvider;
  apiKey: string;
  model?: string;
}): Promise<SavedLlmConnection> => {
  const secret = requireAppEncryptionSecret();

  const now = new Date().toISOString();
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
  const model =
    (input.model || "").trim() ||
    (input.provider === "anthropic"
      ? DEFAULT_ANTHROPIC_MODEL
      : DEFAULT_OPENAI_MODEL);

  if (isCredentialStoreEnabled()) {
    const record = LlmConnectionSchema.parse({
      id,
      createdAt: now,
      updatedAt: now,
      provider: input.provider,
      model,
      encryptedApiKey: encryptString(input.apiKey.trim(), secret),
    });

    await putCredentialRecord(LLM_CONNECTION_NAMESPACE, record.id, record);
    return {
      storage: "database",
      cookieValue: record.id,
      connectionId: record.id,
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
    connectionId: "inline",
    provider: inline.provider,
    model: inline.model,
  };
};

export const getLlmConnection = async (id: string) => {
  const record = await readCredentialRecord<unknown>(LLM_CONNECTION_NAMESPACE, id);
  if (!record) {
    return null;
  }

  const parsed = LlmConnectionSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
};

export const getAllLlmConnections = async (): Promise<LlmConnection[]> => {
  if (!isCredentialStoreEnabled()) {
    return [];
  }

  const records = await listCredentialRecords<unknown>(LLM_CONNECTION_NAMESPACE);
  return records.flatMap(({ payload }) => {
    const parsed = LlmConnectionSchema.safeParse(payload);
    return parsed.success ? [parsed.data] : [];
  });
};

export const deleteLlmConnection = async (id: string) => {
  if (id.startsWith(INLINE_CONNECTION_PREFIX)) {
    return false;
  }

  return deleteCredentialRecord(LLM_CONNECTION_NAMESPACE, id);
};

export const readLlmConnectionFromRequest = async (req: Request) => {
  const connectionCookie = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
  const parsedConnection = parseConnectionCookie(connectionCookie);
  if (
    parsedConnection.kind !== "stored" ||
    !isCredentialStoreEnabled()
  ) {
    return null;
  }

  return getLlmConnection(parsedConnection.id);
};

export const getStoredConnectionIdFromCookie = (cookieValue: string) => {
  const parsedConnection = parseConnectionCookie(cookieValue);
  if (parsedConnection.kind !== "stored") {
    return "";
  }

  return parsedConnection.id;
};

/**
 * Build the cookie value for multi-model storage.
 * Appends a new DB connection ID to the existing cookie array.
 * For inline connections, returns the inline value directly (only one supported).
 */
export const buildMultiConnectionCookieValue = (
  existingCookieValue: string,
  newConnection: SavedLlmConnection,
): string => {
  if (newConnection.storage === "cookie") {
    // Inline: can only have one, overwrites
    return newConnection.cookieValue;
  }

  const parsed = parseConnectionCookie(existingCookieValue);
  let existingIds: string[] = [];

  if (parsed.kind === "multi-stored") {
    existingIds = parsed.ids;
  } else if (parsed.kind === "stored") {
    existingIds = [parsed.id];
  }
  // If existing was inline, it gets replaced by the DB-based multi array

  const MAX_COOKIE_CONNECTIONS = 10;
  const deduped = [...new Set([...existingIds, newConnection.connectionId])];
  const newIds = deduped.slice(-MAX_COOKIE_CONNECTIONS);
  return JSON.stringify(newIds);
};

/**
 * Remove a connection ID from the cookie value.
 * Returns the new cookie value (empty string to clear).
 */
export const removeFromConnectionCookie = (
  existingCookieValue: string,
  connectionId: string,
): string => {
  const parsed = parseConnectionCookie(existingCookieValue);

  if (parsed.kind === "inline" && connectionId === "inline") {
    return "";
  }

  if (parsed.kind === "stored") {
    return parsed.id === connectionId ? "" : existingCookieValue;
  }

  if (parsed.kind === "multi-stored") {
    const remaining = parsed.ids.filter((id) => id !== connectionId);
    if (remaining.length === 0) {
      return "";
    }
    return JSON.stringify(remaining);
  }

  return existingCookieValue;
};

const resolveConnectionsFromCookie = async (
  cookieValue: string,
): Promise<ResolvedLlmAuth[]> => {
  const parsed = parseConnectionCookie(cookieValue);
  const connections: ResolvedLlmAuth[] = [];

  if (parsed.kind === "inline") {
    try {
      const inline = decodeInlineConnection(parsed.encryptedPayload);
      connections.push({
        id: "inline",
        source: "connection",
        provider: inline.provider,
        model: inline.model,
        apiKey: inline.apiKey,
      });
    } catch {
      // Skip invalid inline
    }
  } else if (parsed.kind === "stored" && isCredentialStoreEnabled()) {
    try {
      const conn = await getLlmConnection(parsed.id);
      if (conn) {
        connections.push({
          id: conn.id,
          source: "connection",
          provider: conn.provider,
          model: conn.model,
          apiKey: decryptConnectionApiKey(conn),
        });
      }
    } catch (error) {
      console.warn(
        "[llm-auth] Failed to resolve stored connection:",
        error instanceof Error ? error.message : error,
      );
    }
  } else if (parsed.kind === "multi-stored" && isCredentialStoreEnabled()) {
    for (const id of parsed.ids) {
      try {
        const conn = await getLlmConnection(id);
        if (conn) {
          connections.push({
            id: conn.id,
            source: "connection",
            provider: conn.provider,
            model: conn.model,
            apiKey: decryptConnectionApiKey(conn),
          });
        }
      } catch (error) {
        console.warn(
          `[llm-auth] Failed to resolve connection ${id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return connections;
};

const resolveEnvConnections = (): ResolvedLlmAuth[] => {
  const connections: ResolvedLlmAuth[] = [];

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    connections.push({
      id: "env-openai",
      source: "env",
      provider: "openai",
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    connections.push({
      id: "env-anthropic",
      source: "env",
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      apiKey: anthropicKey,
    });
  }

  return connections;
};

/**
 * Deduplicate connections by their unique source:id pair.
 * Preserves the first occurrence of each connection, maintaining
 * the caller's insertion order (BYOK before env).
 */
const deduplicateConnections = (
  connections: ResolvedLlmAuth[],
): ResolvedLlmAuth[] => {
  const seen = new Set<string>();
  return connections.filter((conn) => {
    const key = `${conn.source}:${conn.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const applyConnectionOrder = (
  connections: ResolvedLlmAuth[],
  order: string[],
): ResolvedLlmAuth[] => {
  if (order.length === 0) {
    return connections;
  }

  const byId = new Map(connections.map((c) => [c.id, c]));
  const ordered: ResolvedLlmAuth[] = [];

  for (const id of order) {
    const conn = byId.get(id);
    if (conn) {
      ordered.push(conn);
      byId.delete(id);
    }
  }

  // Append any connections not in the order list
  for (const conn of byId.values()) {
    ordered.push(conn);
  }

  return ordered;
};

const readUserAiConfig = async (
  req: Request,
): Promise<{
  mode: MultiModelMode;
  connectionOrder: string[];
}> => {
  const defaults = { mode: "fallback" as const, connectionOrder: [] as string[] };

  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return defaults;
    }

    const settings = await readJsonByPath<UserSettings>(
      getUserSettingsPath(session.email),
    );

    return {
      mode: settings?.aiConfig?.mode ?? "fallback",
      connectionOrder: settings?.aiConfig?.connectionOrder ?? [],
    };
  } catch {
    return defaults;
  }
};

/**
 * Resolve all available LLM connections from cookie/DB + env vars,
 * ordered by user preference.
 */
export const resolveAllLlmAuthFromRequest = async (
  req: Request,
): Promise<ResolvedLlmAuthList> => {
  const connectionCookie = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);

  const [cookieConnections, envConnections, aiConfig] = await Promise.all([
    resolveConnectionsFromCookie(connectionCookie),
    Promise.resolve(resolveEnvConnections()),
    readUserAiConfig(req),
  ]);

  const allConnections = deduplicateConnections([
    ...cookieConnections,
    ...envConnections,
  ]);

  const ordered = applyConnectionOrder(allConnections, aiConfig.connectionOrder);

  return {
    mode: aiConfig.mode,
    connections: ordered,
  };
};

/**
 * Backward-compatible resolver: returns the first available connection.
 */
export const resolveLlmAuthFromRequest = async (
  req: Request,
): Promise<ResolvedLlmAuth | null> => {
  const all = await resolveAllLlmAuthFromRequest(req);
  return all.connections[0] ?? null;
};
