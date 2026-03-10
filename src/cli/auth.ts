import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";

import {
  clearProfileToken,
  getProfileConfig,
  saveConfig,
  upsertProfile,
  type CliConfig,
  type CliProfileConfig,
} from "./config";
import { IgPosterClient } from "./client";
import { CliError, EXIT_CODES } from "./errors";
import { printLines } from "./output";
import {
  clearStoredRefreshToken,
  resolveProfileConfigSecrets,
  saveStoredRefreshToken,
} from "./secure-storage";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;

export type CliAuthTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  session: {
    id: string;
    label: string;
    email: string;
    domain: string;
  };
};

const buildPkceVerifier = () => randomBytes(32).toString("base64url");

const buildPkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");

const buildLoginState = () => randomBytes(16).toString("hex");

const defaultSessionLabel = () => `IG CLI on ${os.hostname()}`.slice(0, 80);

export const normalizeRequestedSessionLabel = (value?: string) => {
  const normalized = value?.trim();
  if (!normalized) {
    return defaultSessionLabel();
  }

  return normalized.slice(0, 80);
};

const isFutureIso = (value?: string) =>
  Boolean(value) && Date.parse(value as string) > Date.now();

const hasUsableAccessToken = (profile: CliProfileConfig) => {
  if (!profile.token) {
    return false;
  }

  if (!profile.tokenExpiresAt) {
    return true;
  }

  return (
    Date.parse(profile.tokenExpiresAt) - ACCESS_TOKEN_REFRESH_SKEW_MS > Date.now()
  );
};

const openBrowser = async (url: string) => {
  const commands =
    process.platform === "darwin"
      ? [["open", url]]
      : process.platform === "win32"
        ? [["cmd", "/c", "start", "", url]]
        : [["xdg-open", url], ["gio", "open", url]];

  for (const [command, ...args] of commands) {
    const opened = await new Promise<boolean>((resolve) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    });

    if (opened) {
      return true;
    }
  }

  return false;
};

const listenForBrowserCallback = async (timeoutMs: number) => {
  let resolveResult: ((value: { code: string; state: string }) => void) | null = null;
  let rejectResult: ((error: Error) => void) | null = null;
  let settled = false;

  const result = new Promise<{ code: string; state: string }>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>IG Poster CLI login failed</h1><p>You can close this window.</p>");
      if (!settled) {
        settled = true;
        rejectResult?.(new CliError(error, EXIT_CODES.auth));
      }
      void new Promise((resolve) => server.close(resolve));
      return;
    }

    if (!code || !state) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>IG Poster CLI login failed</h1><p>Missing code or state.</p>");
      if (!settled) {
        settled = true;
        rejectResult?.(
          new CliError("Browser callback is missing the auth code.", EXIT_CODES.auth),
        );
      }
      void new Promise((resolve) => server.close(resolve));
      return;
    }

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>IG Poster CLI login complete</h1><p>You can close this window.</p>");

    if (!settled) {
      settled = true;
      resolveResult?.({ code, state });
    }
    void new Promise((resolve) => server.close(resolve));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new CliError("Failed to start the local CLI callback server.", EXIT_CODES.transport);
  }

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectResult?.(
        new CliError("Timed out waiting for browser login to complete.", EXIT_CODES.auth),
      );
      server.close();
    }
  }, timeoutMs);

  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    waitForResult: async () => {
      try {
        return await result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
};

export const persistCliAuthTokens = async (
  config: CliConfig,
  profileName: string,
  host: string,
  tokens: CliAuthTokens,
) => {
  let nextConfig = upsertProfile(clearProfileToken(config, profileName), profileName, {
    host,
    token: tokens.accessToken,
    tokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    email: tokens.session.email,
    domain: tokens.session.domain,
    cliSessionId: tokens.session.id,
    cliSessionLabel: tokens.session.label,
  });

  const storedInKeychain = await saveStoredRefreshToken(
    profileName,
    host,
    tokens.refreshToken,
  );
  if (!storedInKeychain) {
    nextConfig = upsertProfile(nextConfig, profileName, {
      refreshToken: tokens.refreshToken,
    });
  }

  return nextConfig;
};

export const refreshProfileAuth = async (params: {
  config: CliConfig;
  profileName: string;
  host: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}) => {
  const env = params.env ?? process.env;
  const currentProfile = getProfileConfig(params.config, params.profileName);
  if (env.IG_POSTER_TOKEN) {
    return {
      config: params.config,
      profileConfig: currentProfile,
      token: env.IG_POSTER_TOKEN,
    };
  }

  if (hasUsableAccessToken(currentProfile)) {
    return {
      config: params.config,
      profileConfig: currentProfile,
      token: currentProfile.token,
    };
  }

  const initialProfile = await resolveProfileConfigSecrets(
    params.config,
    params.profileName,
    params.host,
    { env },
  );

  if (!initialProfile.refreshToken) {
    if (initialProfile.token && initialProfile.tokenExpiresAt) {
      const cleared = clearProfileToken(params.config, params.profileName);
      await saveConfig(cleared, env);
      return {
        config: cleared,
        profileConfig: getProfileConfig(cleared, params.profileName),
        token: undefined,
      };
    }

    return {
      config: params.config,
      profileConfig: initialProfile,
      token: initialProfile.token,
    };
  }

  if (
    initialProfile.refreshTokenExpiresAt &&
    !isFutureIso(initialProfile.refreshTokenExpiresAt)
  ) {
    const cleared = clearProfileToken(params.config, params.profileName);
    await clearStoredRefreshToken(params.profileName, params.host, { env });
    await saveConfig(cleared, env);
    return {
      config: cleared,
      profileConfig: getProfileConfig(cleared, params.profileName),
      token: undefined,
    };
  }

  const client = new IgPosterClient({
    host: params.host,
    timeoutMs: params.timeoutMs,
  });

  try {
    const response = await client.requestJson<{ ok: true; data: CliAuthTokens }>({
      method: "POST",
      path: "/api/v1/auth/cli/refresh",
      body: {
        refreshToken: initialProfile.refreshToken,
      },
    });
    const nextConfig = await persistCliAuthTokens(
      params.config,
      params.profileName,
      params.host,
      response.data,
    );
    await saveConfig(nextConfig, env);
    return {
      config: nextConfig,
      profileConfig: getProfileConfig(nextConfig, params.profileName),
      token: response.data.accessToken,
    };
  } catch (error) {
    if (
      error instanceof CliError &&
      (error.exitCode === EXIT_CODES.auth || error.exitCode === EXIT_CODES.forbidden)
    ) {
      const cleared = clearProfileToken(params.config, params.profileName);
      await clearStoredRefreshToken(params.profileName, params.host, { env });
      await saveConfig(cleared, env);
      return {
        config: cleared,
        profileConfig: getProfileConfig(cleared, params.profileName),
        token: undefined,
      };
    }

    throw error;
  }
};

export const loginWithBrowser = async (params: {
  host: string;
  timeoutMs: number;
  label?: string;
}) => {
  const verifier = buildPkceVerifier();
  const challenge = buildPkceChallenge(verifier);
  const state = buildLoginState();
  const callback = await listenForBrowserCallback(params.timeoutMs);

  const startUrl = new URL("/api/v1/auth/cli/start", params.host);
  startUrl.searchParams.set("challenge", challenge);
  startUrl.searchParams.set("state", state);
  startUrl.searchParams.set("redirect_uri", callback.redirectUri);

  const opened = await openBrowser(startUrl.toString());
  if (!opened) {
    printLines([
      "Open this URL to continue CLI login:",
      startUrl.toString(),
    ]);
  }

  const { code, state: callbackState } = await callback.waitForResult();
  if (callbackState !== state) {
    throw new CliError("Browser callback returned an unexpected auth state.", EXIT_CODES.auth);
  }

  const client = new IgPosterClient({
    host: params.host,
    timeoutMs: params.timeoutMs,
  });
  const response = await client.requestJson<{ ok: true; data: CliAuthTokens }>({
    method: "POST",
    path: "/api/v1/auth/cli/exchange",
    body: {
      code,
      codeVerifier: verifier,
      label: normalizeRequestedSessionLabel(params.label),
    },
  });

  return response.data;
};
