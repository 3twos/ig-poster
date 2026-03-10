import {
  clearProfileToken,
  saveConfig,
  upsertProfile,
} from "../config";
import {
  loginWithBrowser,
  loginWithDeviceCode,
  persistCliAuthTokens,
  type CliAuthTokens,
} from "../auth";
import { CliError, EXIT_CODES } from "../errors";
import { readTextInput } from "../input";
import { printJson, printKeyValue, printSessionsTable } from "../output";
import { clearStoredRefreshToken } from "../secure-storage";
import type { CliContext } from "../context";
import { IgPosterClient } from "../client";

type LoginOptions = {
  token?: string;
  tokenFile?: string;
  tokenStdin?: boolean;
  deviceCode?: boolean;
  noBrowser?: boolean;
  label?: string;
};

type WhoAmIResponse = {
  ok: true;
  data: {
    actor: {
      email: string;
      domain: string;
      authSource: string;
      expiresAt: string;
    };
  };
};

type SessionsResponse = {
  ok: true;
  data: {
    sessions: Array<{
      id: string;
      label: string;
      email: string;
      domain: string;
      lastUsedAt: string;
      expiresAt: string;
      revokedAt: string | null;
    }>;
  };
};

export const runAuthCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];
  const subject = argv[1];

  switch (action) {
    case "login":
      return login(ctx, argv.slice(1));
    case "logout":
      return logout(ctx);
    case "status":
      return status(ctx);
    case "test":
      return testAuth(ctx);
    case "sessions":
      switch (subject) {
        case "list":
          return listSessions(ctx, argv.slice(2));
        case "revoke":
          return revokeSession(ctx, argv.slice(2));
        default:
          throw new CliError("Usage: ig auth sessions <list|revoke>");
      }
    default:
      throw new CliError(
        "Usage: ig auth <login|logout|status|test|sessions>",
      );
  }
};

const login = async (ctx: CliContext, argv: string[]) => {
  const { parseCommandOptions } = await import("../args");
  const { options, positionals } = parseCommandOptions<LoginOptions>(argv, {
    token: "string",
    "token-file": "string",
    "token-stdin": "boolean",
    "device-code": "boolean",
    "no-browser": "boolean",
    label: "string",
  });

  if (positionals.length > 0) {
    throw new CliError(
      "Usage: ig auth login [--token <value>|--token-file <path>|--token-stdin|--device-code|--no-browser] [--label <name>]",
    );
  }

  const token = await resolveLoginToken(options);
  let nextConfig = ctx.config;
  let result: {
    profile: string;
    host: string;
    actor?: WhoAmIResponse["data"]["actor"];
    session?: CliAuthTokens["session"];
    auth: string;
  };

  if (token) {
    const client = new IgPosterClient({
      host: ctx.host,
      token,
      timeoutMs: ctx.globalOptions.timeoutMs ?? 30_000,
    });
    const response = await client.requestJson<WhoAmIResponse>({
      method: "GET",
      path: "/api/v1/auth/whoami",
    });

    nextConfig = upsertProfile(
      clearProfileToken(ctx.config, ctx.profileName),
      ctx.profileName,
      { host: ctx.host, token },
    );
    await clearStoredRefreshToken(ctx.profileName, ctx.host);
    result = {
      profile: ctx.profileName,
      host: ctx.host,
      actor: response.data.actor,
      auth: "saved",
    };
  } else {
    const loginWithDeviceFlow = options.deviceCode || options.noBrowser;
    const tokens = loginWithDeviceFlow
      ? await loginWithDeviceCode({
          host: ctx.host,
          timeoutMs: Math.max(ctx.globalOptions.timeoutMs ?? 30_000, 30_000),
          label: options.label,
        })
      : await loginWithBrowser({
          host: ctx.host,
          timeoutMs: Math.max(ctx.globalOptions.timeoutMs ?? 30_000, 120_000),
          label: options.label,
        });
    nextConfig = await persistCliAuthTokens(
      ctx.config,
      ctx.profileName,
      ctx.host,
      tokens,
    );
    result = {
      profile: ctx.profileName,
      host: ctx.host,
      actor: {
        email: tokens.session.email,
        domain: tokens.session.domain,
        authSource: "bearer",
        expiresAt: tokens.accessTokenExpiresAt,
      },
      session: tokens.session,
      auth: loginWithDeviceFlow ? "device-code" : "browser-login",
    };
  }

  await saveConfig(nextConfig);

  if (ctx.globalOptions.json) {
    printJson({
      profile: result.profile,
      host: result.host,
      actor: result.actor,
      session: result.session ?? null,
      auth: result.auth,
    });
    return;
  }

  printKeyValue([
    ["profile", result.profile],
    ["host", result.host],
    ["email", result.actor?.email],
    ["domain", result.actor?.domain],
    ["sessionId", result.session?.id],
    ["sessionLabel", result.session?.label],
    ["auth", result.auth],
  ]);
};

const logout = async (ctx: CliContext) => {
  if (ctx.profileConfig.refreshToken && !process.env.IG_POSTER_TOKEN) {
    try {
      await ctx.client.requestJson({
        method: "POST",
        path: "/api/v1/auth/cli/logout",
        body: { refreshToken: ctx.profileConfig.refreshToken },
      });
    } catch (error) {
      if (!(error instanceof CliError) || error.exitCode !== EXIT_CODES.auth) {
        throw error;
      }
    }
  }

  await clearStoredRefreshToken(ctx.profileName, ctx.host);
  await saveConfig(clearProfileToken(ctx.config, ctx.profileName));

  if (ctx.globalOptions.json) {
    printJson({ profile: ctx.profileName, loggedOut: true });
    return;
  }

  printKeyValue([
    ["profile", ctx.profileName],
    ["auth", "cleared"],
  ]);
};

const status = async (ctx: CliContext) => {
  const response = await ctx.client.requestJson<WhoAmIResponse>({
    method: "GET",
    path: "/api/v1/auth/whoami",
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["email", response.data.actor.email],
    ["domain", response.data.actor.domain],
    ["authSource", response.data.actor.authSource],
    ["expiresAt", response.data.actor.expiresAt],
  ]);
};

const testAuth = async (ctx: CliContext) => {
  await ctx.client.requestJson<WhoAmIResponse>({
    method: "GET",
    path: "/api/v1/auth/whoami",
  });

  if (!ctx.globalOptions.quiet) {
    printKeyValue([["auth", "ok"]]);
  }
};

const listSessions = async (ctx: CliContext, argv: string[]) => {
  if (argv.length > 0) {
    throw new CliError("Usage: ig auth sessions list");
  }

  const response = await ctx.client.requestJson<SessionsResponse>({
    method: "GET",
    path: "/api/v1/auth/sessions",
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printSessionsTable(response.data.sessions);
};

const revokeSession = async (ctx: CliContext, argv: string[]) => {
  const [id] = argv;
  if (!id) {
    throw new CliError("Usage: ig auth sessions revoke <id>");
  }

  const response = await ctx.client.requestJson<{
    ok: true;
    data: { session: SessionsResponse["data"]["sessions"][number] };
  }>({
    method: "POST",
    path: `/api/v1/auth/sessions/${id}/revoke`,
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["sessionId", response.data.session.id],
    ["sessionLabel", response.data.session.label],
    ["revokedAt", response.data.session.revokedAt ?? "-"],
  ]);
};

const resolveLoginToken = async (options: LoginOptions) => {
  const manualSources = [
    options.token,
    options.tokenFile,
    options.tokenStdin,
  ].filter(Boolean).length;
  const deviceSources = [options.deviceCode, options.noBrowser].filter(Boolean).length;

  if (manualSources > 1) {
    throw new CliError(
      "Choose exactly one of --token, --token-file, or --token-stdin",
      EXIT_CODES.usage,
    );
  }

  if (deviceSources > 1) {
    throw new CliError(
      "Choose either --device-code or --no-browser, not both.",
      EXIT_CODES.usage,
    );
  }

  if (manualSources > 0 && deviceSources > 0) {
    throw new CliError(
      "Choose either a manual token source or device-code login.",
      EXIT_CODES.usage,
    );
  }

  if (options.token) {
    return options.token;
  }

  if (options.tokenFile) {
    return readTextInput(`@${options.tokenFile}`);
  }

  if (options.tokenStdin) {
    return readTextInput("-");
  }

  return null;
};
