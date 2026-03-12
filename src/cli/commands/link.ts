import { parseCommandOptions } from "../args";
import { parseConfigHost } from "../config";
import type { CliContext } from "../context";
import { CliError } from "../errors";
import { printJsonEnvelope, printKeyValue } from "../output";
import {
  loadProjectLinkAtDir,
  removeProjectLink,
  saveProjectLink,
} from "../project";

type LinkOptions = {
  host?: string;
  profile?: string;
  brandKit?: string;
  outputDir?: string;
};

export const runLinkCommand = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<LinkOptions>(argv, {
    host: "string",
    profile: "string",
    "brand-kit": "string",
    "output-dir": "string",
  });

  if (positionals.length > 0) {
    throw new CliError(
      "Usage: ig link [--host <url>] [--profile <name>] [--brand-kit <id>] [--output-dir <path>]",
    );
  }

  const cwd = process.cwd();
  const existing = await loadProjectLinkAtDir(cwd);
  const host = options.host ? normalizeHost(options.host) : ctx.host;
  const profile = normalizeOptionalValue(options.profile, "--profile") ?? ctx.profileName;
  const normalizedBrandKit = normalizeOptionalValue(
    options.brandKit,
    "--brand-kit",
  );
  const normalizedOutputDir = normalizeOptionalValue(
    options.outputDir,
    "--output-dir",
  );
  const defaults = {
    ...(existing?.config.defaults ?? {}),
    ...(normalizedBrandKit ? { brandKitId: normalizedBrandKit } : {}),
    ...(normalizedOutputDir ? { outputDir: normalizedOutputDir } : {}),
  };

  const linked = await saveProjectLink(cwd, {
    host,
    profile,
    ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
  });

  if (ctx.globalOptions.json) {
    printJsonEnvelope({
      linked: true,
      path: linked.configPath,
      project: linked.config,
    }, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["linked", "true"],
    ["path", linked.configPath],
    ["host", linked.config.host],
    ["profile", linked.config.profile],
    ["defaultBrandKitId", linked.config.defaults?.brandKitId],
    ["outputDir", linked.config.defaults?.outputDir],
  ]);
};

export const runUnlinkCommand = async (ctx: CliContext, argv: string[]) => {
  if (argv.length > 0) {
    throw new CliError("Usage: ig unlink");
  }

  const removed = await removeProjectLink();

  if (ctx.globalOptions.json) {
    printJsonEnvelope({
      linked: false,
      removed: Boolean(removed),
      path: removed?.configPath ?? null,
    }, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["linked", "false"],
    ["removed", String(Boolean(removed))],
    ["path", removed?.configPath],
  ]);
};

const normalizeHost = (value: string) => {
  try {
    return parseConfigHost(value);
  } catch {
    throw new CliError(`Invalid host URL: ${value}`);
  }
};

const normalizeOptionalValue = (value: string | undefined, optionName: string) => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value?.trim();
  if (!normalized) {
    throw new CliError(`${optionName} must not be empty.`);
  }

  return normalized;
};
