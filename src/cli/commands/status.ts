import { printJson, printKeyValue } from "../output";
import type { CliContext } from "../context";

type StatusResponse = {
  ok: true;
  data: {
    actor: {
      type: string;
      subjectId: string;
      email: string;
      domain: string;
      authSource: string;
      scopes: string[];
      issuedAt: string;
      expiresAt: string;
    };
    meta: {
      connected: boolean;
      source: "oauth" | "env" | null;
      account?: {
        connectionId?: string;
        instagramUserId: string;
        instagramUsername?: string;
        instagramName?: string;
        pageName?: string;
        tokenExpiresAt?: string;
      };
      detail?: string;
    };
    llm: {
      connected: boolean;
      mode: "fallback" | "parallel";
      connections: Array<{
        id: string;
        source: "connection" | "env";
        provider: "openai" | "anthropic";
        model: string;
        connected: boolean;
        removable: boolean;
      }>;
      source?: "connection" | "env" | null;
      provider?: "openai" | "anthropic";
      model?: string;
    };
    publishWindow: {
      available: boolean;
      limit: number | null;
      used: number | null;
      remaining: number | null;
      windowStart: string | null;
      detail?: string;
    };
  };
};

export const runStatusCommand = async (ctx: CliContext) => {
  let status: StatusResponse | null = null;
  let authError: string | null = null;

  if (ctx.token) {
    try {
      status = await ctx.client.requestJson<StatusResponse>({
        method: "GET",
        path: "/api/v1/status",
      });
    } catch (error) {
      authError = error instanceof Error ? error.message : "Auth check failed";
    }
  }

  const payload = {
    profile: ctx.profileName,
    host: ctx.host,
    authenticated: Boolean(status),
    actor: status?.data.actor ?? null,
    meta: status?.data.meta ?? null,
    llm: status?.data.llm ?? null,
    publishWindow: status?.data.publishWindow ?? null,
    authError,
    projectLink: ctx.projectLink
      ? {
          rootDir: ctx.projectLink.rootDir,
          path: ctx.projectLink.configPath,
          ...ctx.projectLink.config,
        }
      : null,
  };

  if (ctx.globalOptions.json) {
    printJson(payload, ctx.globalOptions.jq);
    return;
  }

  const llmConnections = payload.llm?.connections?.length
    ? payload.llm.connections
      .map((connection) => `${connection.provider}:${connection.model} [${connection.source}]`)
      .join(", ")
    : undefined;
  const metaAccount = payload.meta?.account
    ? payload.meta.account.instagramUsername
      ? `@${payload.meta.account.instagramUsername}`
      : payload.meta.account.instagramUserId
    : undefined;
  const publishWindowUsage =
    payload.publishWindow?.available &&
    payload.publishWindow.limit !== null &&
    payload.publishWindow.used !== null &&
    payload.publishWindow.remaining !== null
      ? `${payload.publishWindow.used}/${payload.publishWindow.limit} used, ${payload.publishWindow.remaining} remaining`
      : undefined;

  printKeyValue([
    ["profile", payload.profile],
    ["host", payload.host],
    ["authenticated", String(payload.authenticated)],
    ["email", payload.actor?.email],
    ["domain", payload.actor?.domain],
    ["authSource", payload.actor?.authSource],
    ["expiresAt", payload.actor?.expiresAt],
    ["linkedProject", String(Boolean(payload.projectLink))],
    ["projectRoot", payload.projectLink?.rootDir],
    ["projectPath", payload.projectLink?.path],
    ["projectHost", payload.projectLink?.host],
    ["projectProfile", payload.projectLink?.profile],
    ["defaultBrandKitId", payload.projectLink?.defaults?.brandKitId],
    ["outputDir", payload.projectLink?.defaults?.outputDir],
    ["metaConnected", payload.meta ? String(payload.meta.connected) : undefined],
    ["metaSource", payload.meta?.source ?? undefined],
    ["metaAccount", metaAccount],
    ["metaPage", payload.meta?.account?.pageName],
    ["metaTokenExpiresAt", payload.meta?.account?.tokenExpiresAt],
    ["metaDetail", payload.meta?.detail],
    ["llmConnected", payload.llm ? String(payload.llm.connected) : undefined],
    ["llmMode", payload.llm?.mode],
    ["llmConnections", llmConnections],
    ["publishWindowAvailable", payload.publishWindow ? String(payload.publishWindow.available) : undefined],
    ["publishWindowUsage", publishWindowUsage],
    ["publishWindowStart", payload.publishWindow?.windowStart ?? undefined],
    ["publishWindowDetail", payload.publishWindow?.detail],
    ["authError", payload.authError ?? undefined],
  ]);
};
