import {
  getProfileConfig,
  getProfileName,
  loadConfig,
  resolveHost,
  resolveToken,
  saveConfig,
  type CliConfig,
  type CliProfileConfig,
} from "./config";
import type { GlobalOptions } from "./args";
import {
  loginWithBrowser,
  persistCliAuthTokens,
  refreshProfileAuth,
} from "./auth";
import { IgPosterClient } from "./client";
import { CliError, EXIT_CODES } from "./errors";
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

  if (!resolved.token) {
    if (!canAutoBootstrapBrowserAuth()) {
      throw new CliError(
        "Authentication required. Run `ig auth login` interactively first, or set IG_POSTER_TOKEN.",
        EXIT_CODES.auth,
      );
    }

    if (!globalOptions.quiet) {
      process.stderr.write(
        `No IG Poster CLI session found for profile "${profileName}". Opening browser login...\n`,
      );
    }

    const tokens = await loginWithBrowser({
      host,
      timeoutMs: Math.max(globalOptions.timeoutMs ?? 30_000, 120_000),
    });
    const nextConfig = await persistCliAuthTokens(
      resolved.config,
      profileName,
      host,
      tokens,
    );
    await saveConfig(nextConfig);

    return {
      client: new IgPosterClient({
        host,
        token: tokens.accessToken,
        timeoutMs: globalOptions.timeoutMs ?? 30_000,
      }),
      config: nextConfig,
      profileConfig: getProfileConfig(nextConfig, profileName),
      profileName,
      host,
      token: tokens.accessToken,
      projectLink,
      globalOptions,
    } satisfies CliContext;
  }

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

const canAutoBootstrapBrowserAuth = () =>
  Boolean(process.stdin.isTTY && process.stderr.isTTY);
