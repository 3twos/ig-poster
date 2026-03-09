import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

const ProfileConfigSchema = z.object({
  host: z.string().url().optional(),
  token: z.string().min(1).optional(),
});

const CliConfigSchema = z.object({
  version: z.literal(1),
  defaultProfile: z.string().min(1),
  profiles: z.record(z.string(), ProfileConfigSchema),
});

export type CliConfig = z.infer<typeof CliConfigSchema>;
export type CliProfileConfig = z.infer<typeof ProfileConfigSchema>;

const DEFAULT_PROFILE = "default";

const createDefaultConfig = (): CliConfig => ({
  version: 1,
  defaultProfile: DEFAULT_PROFILE,
  profiles: {
    [DEFAULT_PROFILE]: {},
  },
});

export const getConfigDir = (env: NodeJS.ProcessEnv = process.env) => {
  if (env.IG_POSTER_CONFIG_DIR) {
    return env.IG_POSTER_CONFIG_DIR;
  }

  if (env.XDG_CONFIG_HOME) {
    return path.join(env.XDG_CONFIG_HOME, "ig-poster");
  }

  return path.join(os.homedir(), ".config", "ig-poster");
};

export const getConfigPath = (env: NodeJS.ProcessEnv = process.env) =>
  path.join(getConfigDir(env), "config.json");

export const loadConfig = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<CliConfig> => {
  const filePath = getConfigPath(env);

  try {
    const raw = await readFile(filePath, "utf8");
    return CliConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    const nodeError =
      error instanceof Error
        ? (error as Error & { code?: string })
        : { code: undefined };
    if (nodeError.code === "ENOENT") {
      return createDefaultConfig();
    }

    throw error;
  }
};

export const saveConfig = async (
  config: CliConfig,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const filePath = getConfigPath(env);
  const configDir = path.dirname(filePath);
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await chmod(configDir, 0o700);
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(filePath, 0o600);
};

export const getProfileName = (
  config: CliConfig,
  explicitProfile?: string,
  env: NodeJS.ProcessEnv = process.env,
) => explicitProfile ?? env.IG_POSTER_PROFILE ?? config.defaultProfile;

export const getProfileConfig = (
  config: CliConfig,
  profileName: string,
): CliProfileConfig => config.profiles[profileName] ?? {};

export const upsertProfile = (
  config: CliConfig,
  profileName: string,
  patch: CliProfileConfig,
): CliConfig => ({
  ...config,
  profiles: {
    ...config.profiles,
    [profileName]: {
      ...getProfileConfig(config, profileName),
      ...patch,
    },
  },
});

export const clearProfileToken = (config: CliConfig, profileName: string) => {
  const current = getProfileConfig(config, profileName);
  const nextProfile = { ...current };
  delete nextProfile.token;

  return {
    ...config,
    profiles: {
      ...config.profiles,
      [profileName]: nextProfile,
    },
  };
};

export const parseConfigHost = (value: string) => {
  const normalized = value.trim();
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Host must use http or https");
  }

  return normalized;
};

export const resolveHost = (
  config: CliConfig,
  profileName: string,
  explicitHost?: string,
  env: NodeJS.ProcessEnv = process.env,
) =>
  explicitHost ??
  env.IG_POSTER_HOST ??
  getProfileConfig(config, profileName).host ??
  "http://localhost:3000";

export const resolveToken = (
  config: CliConfig,
  profileName: string,
  env: NodeJS.ProcessEnv = process.env,
) => env.IG_POSTER_TOKEN ?? getProfileConfig(config, profileName).token;
