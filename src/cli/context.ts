import {
  getProfileName,
  loadConfig,
  resolveHost,
  resolveToken,
  type CliConfig,
} from "./config";
import type { GlobalOptions } from "./args";
import { IgPosterClient } from "./client";

export type CliContext = {
  client: IgPosterClient;
  config: CliConfig;
  profileName: string;
  host: string;
  token?: string;
  globalOptions: GlobalOptions;
};

export const createContext = async (globalOptions: GlobalOptions) => {
  const config = await loadConfig();
  const profileName = getProfileName(config, globalOptions.profile);
  const host = resolveHost(config, profileName, globalOptions.host);
  const token = resolveToken(config, profileName);

  return {
    client: new IgPosterClient({
      host,
      token,
      timeoutMs: globalOptions.timeoutMs ?? 30_000,
    }),
    config,
    profileName,
    host,
    token,
    globalOptions,
  } satisfies CliContext;
};
