import {
  getProfileName,
  getProfileConfig,
  loadConfig,
  parseConfigHost,
  saveConfig,
  upsertProfile,
} from "../config";
import { CliError } from "../errors";
import {
  printJson,
  printJsonEnvelope,
  printKeyValue,
  printValue,
} from "../output";
import type { CliContext } from "../context";

export const runConfigCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "list":
      return listConfig(ctx);
    case "get":
      return getConfig(ctx, argv.slice(1));
    case "set":
      return setConfig(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig config <list|get|set>");
  }
};

const listConfig = async (ctx: CliContext) => {
  const config = await loadConfig();
  if (ctx.globalOptions.json) {
    printJsonEnvelope({ config }, ctx.globalOptions.jq);
    return;
  }

  printJson(config);
};

const getConfig = async (ctx: CliContext, argv: string[]) => {
  const [key] = argv;
  if (!key) {
    throw new CliError("Usage: ig config get <host|token>");
  }

  const config = await loadConfig();
  const profile = getProfileConfig(config, getProfileName(config, ctx.globalOptions.profile));
  const value = profile[key as keyof typeof profile];

  if (ctx.globalOptions.json) {
    printJsonEnvelope({ key, value }, ctx.globalOptions.jq);
    return;
  }

  printValue(value);
};

const setConfig = async (ctx: CliContext, argv: string[]) => {
  const [key, value] = argv;
  if (!key || value === undefined) {
    throw new CliError("Usage: ig config set <host> <value>");
  }

  if (key !== "host") {
    throw new CliError("Only `host` is supported by `ig config set` right now.");
  }

  let normalizedHost: string;
  try {
    normalizedHost = parseConfigHost(value);
  } catch {
    throw new CliError(`Invalid host URL: ${value}`);
  }

  const config = await loadConfig();
  const profileName = getProfileName(config, ctx.globalOptions.profile);
  await saveConfig(upsertProfile(config, profileName, { host: normalizedHost }));

  if (ctx.globalOptions.json) {
    printJsonEnvelope(
      { profile: profileName, key, value: normalizedHost },
      ctx.globalOptions.jq,
    );
    return;
  }

  printKeyValue([
    ["profile", profileName],
    ["host", normalizedHost],
  ]);
};
