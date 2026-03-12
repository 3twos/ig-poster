import { getDb } from "@/db";
import { readJsonByPath } from "@/lib/blob-store";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  type MultiModelMode,
} from "@/lib/llm-constants";
import { getPublishWindowUsage } from "@/lib/publish-jobs";
import type {
  LlmConnectionStatus,
  LlmMultiAuthStatus,
  MetaAuthStatus,
} from "@/lib/types";
import { getUserSettingsPath, type UserSettings } from "@/lib/user-settings";
import type { Actor } from "@/services/actors";
import { resolveMetaAuthForApi } from "@/services/meta-auth";

export type PublishWindowStatus = {
  available: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  windowStart: string | null;
  detail?: string;
};

export type ApiStatus = {
  actor: {
    type: Actor["type"];
    subjectId: string;
    email: string;
    domain: string;
    authSource: Actor["authSource"];
    scopes: string[];
    issuedAt: string;
    expiresAt: string;
  };
  meta: MetaAuthStatus;
  llm: LlmMultiAuthStatus;
  publishWindow: PublishWindowStatus;
};

const resolveMetaStatus = async (
  actor: Actor,
): Promise<MetaAuthStatus> => {
  try {
    const resolved = await resolveMetaAuthForApi({ ownerHash: actor.ownerHash });
    return {
      connected: true,
      source: resolved.source,
      account: resolved.account,
    };
  } catch (error) {
    return {
      connected: false,
      source: null,
      detail: error instanceof Error ? error.message : "Instagram auth unavailable.",
    };
  }
};

const resolveEnvLlmConnections = (): LlmConnectionStatus[] => {
  const connections: LlmConnectionStatus[] = [];

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    connections.push({
      id: "env-openai",
      source: "env",
      provider: "openai",
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      connected: true,
      removable: false,
    });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    connections.push({
      id: "env-anthropic",
      source: "env",
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
      connected: true,
      removable: false,
    });
  }

  return connections;
};

const readActorAiConfig = async (
  actor: Actor,
): Promise<{ mode: MultiModelMode; connectionOrder: string[] }> => {
  const defaults = { mode: "fallback" as const, connectionOrder: [] as string[] };

  try {
    const settings = await readJsonByPath<UserSettings>(getUserSettingsPath(actor.email));
    return {
      mode: settings?.aiConfig?.mode ?? defaults.mode,
      connectionOrder: settings?.aiConfig?.connectionOrder ?? defaults.connectionOrder,
    };
  } catch {
    return defaults;
  }
};

const applyConnectionOrder = (
  connections: LlmConnectionStatus[],
  order: string[],
) => {
  if (order.length === 0) {
    return connections;
  }

  const byId = new Map(connections.map((connection) => [connection.id, connection]));
  const ordered: LlmConnectionStatus[] = [];

  for (const id of order) {
    const connection = byId.get(id);
    if (!connection) {
      continue;
    }

    ordered.push(connection);
    byId.delete(id);
  }

  ordered.push(...byId.values());
  return ordered;
};

const resolveLlmStatus = async (actor: Actor): Promise<LlmMultiAuthStatus> => {
  const aiConfig = await readActorAiConfig(actor);
  // Bearer-auth CLI routes only see env-backed LLM credentials today.
  const connections = applyConnectionOrder(
    resolveEnvLlmConnections(),
    aiConfig.connectionOrder,
  );
  const first = connections[0];

  return {
    connections,
    mode: aiConfig.mode,
    connected: connections.length > 0,
    source: first?.source ?? null,
    provider: first?.provider,
    model: first?.model,
  };
};

const resolvePublishWindowStatus = async (
  actor: Actor,
): Promise<PublishWindowStatus> => {
  try {
    const usage = await getPublishWindowUsage(getDb(), actor.ownerHash);
    return {
      available: true,
      limit: usage.limit,
      used: usage.used,
      remaining: usage.remaining,
      windowStart: usage.windowStart.toISOString(),
    };
  } catch (error) {
    return {
      available: false,
      limit: null,
      used: null,
      remaining: null,
      windowStart: null,
      detail: error instanceof Error ? error.message : "Publish window usage unavailable.",
    };
  }
};

export const getApiStatus = async (actor: Actor): Promise<ApiStatus> => {
  const [meta, llm, publishWindow] = await Promise.all([
    resolveMetaStatus(actor),
    resolveLlmStatus(actor),
    resolvePublishWindowStatus(actor),
  ]);

  return {
    actor: {
      type: actor.type,
      subjectId: actor.subjectId,
      email: actor.email,
      domain: actor.domain,
      authSource: actor.authSource,
      scopes: actor.scopes,
      issuedAt: actor.issuedAt,
      expiresAt: actor.expiresAt,
    },
    meta,
    llm,
    publishWindow,
  };
};
