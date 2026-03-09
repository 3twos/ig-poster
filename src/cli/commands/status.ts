import { printJson, printKeyValue } from "../output";
import type { CliContext } from "../context";

type WhoAmIResponse = {
  ok: true;
  data: {
    actor: {
      email: string;
      authSource: string;
      expiresAt: string;
    };
  };
};

export const runStatusCommand = async (ctx: CliContext) => {
  let whoami: WhoAmIResponse | null = null;
  let authError: string | null = null;

  if (ctx.token) {
    try {
      whoami = await ctx.client.requestJson<WhoAmIResponse>({
        method: "GET",
        path: "/api/v1/auth/whoami",
      });
    } catch (error) {
      authError = error instanceof Error ? error.message : "Auth check failed";
    }
  }

  const payload = {
    profile: ctx.profileName,
    host: ctx.host,
    authenticated: Boolean(whoami),
    actor: whoami?.data.actor ?? null,
    authError,
  };

  if (ctx.globalOptions.json) {
    printJson(payload, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["profile", payload.profile],
    ["host", payload.host],
    ["authenticated", String(payload.authenticated)],
    ["email", payload.actor?.email],
    ["authSource", payload.actor?.authSource],
    ["expiresAt", payload.actor?.expiresAt],
    ["authError", payload.authError ?? undefined],
  ]);
};
