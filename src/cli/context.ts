import {
  getProfileName,
  loadConfig,
  resolveHost,
  type CliConfig,
  type CliProfileConfig,
} from "./config";
import type { GlobalOptions } from "./args";
import { refreshProfileAuth } from "./auth";
import { IgPosterClient } from "./client";

export type CliContext = {
  client: IgPosterClient;
  config: CliConfig;
  profileConfig: CliProfileConfig;
  profileName: string;
  host: string;
  token?: string;
  globalOptions: GlobalOptions;
};

export const createContext = async (globalOptions: GlobalOptions) => {
  const initialConfig = await loadConfig();
  const profileName = getProfileName(initialConfig, globalOptions.profile);
  const host = resolveHost(initialConfig, profileName, globalOptions.host);
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
    globalOptions,
  } satisfies CliContext;
};
