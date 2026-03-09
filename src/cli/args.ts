import { CliError, EXIT_CODES } from "./errors";

export type GlobalOptions = {
  host?: string;
  profile?: string;
  json: boolean;
  jq?: string;
  quiet: boolean;
  noColor: boolean;
  yes: boolean;
  dryRun: boolean;
  timeoutMs?: number;
};

type FlagType = "boolean" | "string";

const GLOBAL_FLAG_TYPES: Record<string, FlagType> = {
  host: "string",
  profile: "string",
  json: "boolean",
  jq: "string",
  quiet: "boolean",
  "no-color": "boolean",
  yes: "boolean",
  "dry-run": "boolean",
  timeout: "string",
};

export const parseGlobalOptions = (argv: string[]) => {
  const options: GlobalOptions = {
    json: false,
    quiet: false,
    noColor: false,
    yes: false,
    dryRun: false,
  };
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      rest.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    const flagType = GLOBAL_FLAG_TYPES[rawName];
    if (!flagType) {
      rest.push(token);
      continue;
    }

    if (flagType === "boolean") {
      setGlobalBoolean(options, rawName);
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliError(`Missing value for --${rawName}`, EXIT_CODES.usage);
    }

    setGlobalString(options, rawName, value);
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { options, rest };
};

const setGlobalBoolean = (options: GlobalOptions, flag: string) => {
  switch (flag) {
    case "json":
      options.json = true;
      break;
    case "quiet":
      options.quiet = true;
      break;
    case "no-color":
      options.noColor = true;
      break;
    case "yes":
      options.yes = true;
      break;
    case "dry-run":
      options.dryRun = true;
      break;
    default:
      break;
  }
};

const setGlobalString = (
  options: GlobalOptions,
  flag: string,
  value: string,
) => {
  switch (flag) {
    case "host":
      options.host = value;
      break;
    case "profile":
      options.profile = value;
      break;
    case "jq":
      options.jq = value;
      break;
    case "timeout": {
      const duration = Number.parseInt(value, 10);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new CliError(
          `Invalid timeout value: ${value}`,
          EXIT_CODES.usage,
        );
      }
      options.timeoutMs = duration;
      break;
    }
    default:
      break;
  }
};

export const parseCommandOptions = <T extends Record<string, string | boolean>>(
  argv: string[],
  schema: Record<string, FlagType>,
): { options: T; positionals: string[] } => {
  const options = {} as T;
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    const flagType = schema[rawName];
    if (!flagType) {
      throw new CliError(`Unknown option: --${rawName}`, EXIT_CODES.usage);
    }

    if (flagType === "boolean") {
      options[camelCase(rawName) as keyof T] = true as T[keyof T];
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliError(`Missing value for --${rawName}`, EXIT_CODES.usage);
    }

    options[camelCase(rawName) as keyof T] = value as T[keyof T];
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return { options, positionals };
};

const camelCase = (value: string) =>
  value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
