import {
  getProfileName,
  loadConfig,
  resolveHost,
  resolveToken,
  type CliConfig,
  type CliProfileConfig,
} from "./config";
import type { GlobalOptions } from "./args";
import { refreshProfileAuth } from "./auth";
import { IgPosterClient } from "./client";
import { loadProjectLink, type LoadedProjectLink } from "./project";
import { resolveProfileConfigSecrets } from "./secure-storage";

export type CliContext = {
  client: IgPosterClient;
  config: CliConfig;
  profileConfig: CliProfileConfig;
  profileName: string;
  host: string;
  token?: string;
  projectLink: LoadedProjectLink | null;
  globalOptions: GlobalOptions;
};

export const createContext = async (
  globalOptions: GlobalOptions,
  options: { refreshAuth?: boolean } = {},
) => {
  const initialConfig = await loadConfig();
  const projectLink = await loadProjectLink();
  const profileName = getProfileName(
    initialConfig,
    globalOptions.profile,
    process.env,
    projectLink?.config.profile,
  );
  const host = resolveHost(
    initialConfig,
    profileName,
    globalOptions.host,
    process.env,
    projectLink?.config.host,
  );

  if (options.refreshAuth === false) {
    const profileConfig = await resolveProfileConfigSecrets(
      initialConfig,
      profileName,
      host,
    );
    const token = resolveToken(initialConfig, profileName);

    return {
      client: new IgPosterClient({
        host,
        token,
        timeoutMs: globalOptions.timeoutMs ?? 30_000,
      }),
      config: initialConfig,
      profileConfig,
      profileName,
      host,
      token,
      projectLink,
      globalOptions,
    } satisfies CliContext;
  }

  const resolved = await refreshProfileAuth({
    config: initialConfig,
    profileName,
    host,
    timeoutMs: globalOptions.timeoutMs ?? 30_000,
  });

  return {
    client: new IgPosterClient({
      host,
      token: resolved.token,
      timeoutMs: globalOptions.timeoutMs ?? 30_000,
    }),
    config: resolved.config,
    profileConfig: resolved.profileConfig,
    profileName,
    host,
    token: resolved.token,
    projectLink,
    globalOptions,
  } satisfies CliContext;
};
