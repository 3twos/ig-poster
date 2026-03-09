import {
  clearProfileToken,
  getProfileName,
  loadConfig,
  saveConfig,
  upsertProfile,
} from "../config";
import { CliError, EXIT_CODES } from "../errors";
import { readTextInput } from "../input";
import { printJson, printKeyValue } from "../output";
import type { CliContext } from "../context";
import { IgPosterClient } from "../client";

type LoginOptions = {
  token?: string;
  tokenFile?: string;
  tokenStdin?: boolean;
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

export const runAuthCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "login":
      return login(ctx, argv.slice(1));
    case "logout":
      return logout(ctx);
    case "status":
      return status(ctx);
    case "test":
      return testAuth(ctx);
    default:
      throw new CliError("Usage: ig auth <login|logout|status|test>");
  }
};

const login = async (ctx: CliContext, argv: string[]) => {
  const { parseCommandOptions } = await import("../args");
  const { options, positionals } = parseCommandOptions<LoginOptions>(argv, {
    token: "string",
    "token-file": "string",
    "token-stdin": "boolean",
  });

  if (positionals.length > 0) {
    throw new CliError("Usage: ig auth login [--token <value>|--token-file <path>|--token-stdin]");
  }

  const token = await resolveLoginToken(options);
  if (!token) {
    throw new CliError(
      "Provide a token with --token, --token-file, or --token-stdin",
    );
  }

  const client = new IgPosterClient({
    host: ctx.host,
    token,
    timeoutMs: ctx.globalOptions.timeoutMs ?? 30_000,
  });
  const response = await client.requestJson<WhoAmIResponse>({
    method: "GET",
    path: "/api/v1/auth/whoami",
  });

  const config = await loadConfig();
  const profileName = getProfileName(config, ctx.globalOptions.profile);
  await saveConfig(upsertProfile(config, profileName, { host: ctx.host, token }));

  if (ctx.globalOptions.json) {
    printJson({
      profile: profileName,
      host: ctx.host,
      actor: response.data.actor,
    });
    return;
  }

  printKeyValue([
    ["profile", profileName],
    ["host", ctx.host],
    ["email", response.data.actor.email],
    ["domain", response.data.actor.domain],
    ["auth", "saved"],
  ]);
};

const logout = async (ctx: CliContext) => {
  const config = await loadConfig();
  const profileName = getProfileName(config, ctx.globalOptions.profile);
  await saveConfig(clearProfileToken(config, profileName));

  if (ctx.globalOptions.json) {
    printJson({ profile: profileName, loggedOut: true });
    return;
  }

  printKeyValue([
    ["profile", profileName],
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

const resolveLoginToken = async (options: LoginOptions) => {
  const sources = [options.token, options.tokenFile, options.tokenStdin].filter(
    Boolean,
  ).length;

  if (sources > 1) {
    throw new CliError(
      "Choose exactly one of --token, --token-file, or --token-stdin",
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
