import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

vi.mock("@/cli/secure-storage", () => ({
  clearStoredRefreshToken: vi.fn(async () => false),
  resolveProfileConfigSecrets: vi.fn(async (config, profileName) => config.profiles[profileName] ?? {}),
  saveStoredRefreshToken: vi.fn(async () => false),
}));

vi.mock("@/cli/client", () => ({
  IgPosterClient: vi.fn(
    function IgPosterClientMock() {
      return { requestJson };
    },
  ),
}));

import {
  normalizeRequestedSessionLabel,
  persistCliAuthTokens,
  refreshProfileAuth,
} from "@/cli/auth";
import {
  clearProfileToken,
  getProfileConfig,
  loadConfig,
  saveConfig,
  upsertProfile,
} from "@/cli/config";
import { CliError, EXIT_CODES } from "@/cli/errors";
import {
  clearStoredRefreshToken,
  resolveProfileConfigSecrets,
  saveStoredRefreshToken,
} from "@/cli/secure-storage";

const mockedClearStoredRefreshToken = vi.mocked(clearStoredRefreshToken);
const mockedResolveProfileConfigSecrets = vi.mocked(resolveProfileConfigSecrets);
const mockedSaveStoredRefreshToken = vi.mocked(saveStoredRefreshToken);

describe("cli auth helpers", () => {
  let configDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    configDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-auth-"));
    env = { ...process.env, IG_POSTER_CONFIG_DIR: configDir };
    requestJson.mockReset();
    mockedClearStoredRefreshToken.mockReset();
    mockedResolveProfileConfigSecrets.mockReset();
    mockedSaveStoredRefreshToken.mockReset();
    mockedResolveProfileConfigSecrets.mockImplementation(
      async (config, profileName) => config.profiles[profileName] ?? {},
    );
    mockedSaveStoredRefreshToken.mockResolvedValue(false);
  });

  afterEach(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  it("persists browser-issued auth tokens with session metadata", async () => {
    const config = await loadConfig(env);
    const nextConfig = await persistCliAuthTokens(config, "default", "http://localhost:3000", {
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-03-09T20:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2026-04-08T20:00:00.000Z",
      session: {
        id: "session-1",
        label: "Laptop",
        email: "person@example.com",
        domain: "example.com",
      },
    });

    expect(getProfileConfig(nextConfig, "default")).toMatchObject({
      token: "access-token",
      refreshToken: "session.secret",
      email: "person@example.com",
      cliSessionId: "session-1",
      cliSessionLabel: "Laptop",
    });
  });

  it("omits the refresh token from config when keychain storage succeeds", async () => {
    mockedSaveStoredRefreshToken.mockResolvedValueOnce(true);

    const config = await loadConfig(env);
    const nextConfig = await persistCliAuthTokens(config, "default", "http://localhost:3000", {
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-03-09T20:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2026-04-08T20:00:00.000Z",
      session: {
        id: "session-1",
        label: "Laptop",
        email: "person@example.com",
        domain: "example.com",
      },
    });

    expect(mockedSaveStoredRefreshToken).toHaveBeenCalledWith(
      "default",
      "http://localhost:3000",
      "session.secret",
    );
    expect(getProfileConfig(nextConfig, "default")).not.toHaveProperty("refreshToken");
    expect(getProfileConfig(nextConfig, "default").refreshTokenExpiresAt).toBe(
      "2026-04-08T20:00:00.000Z",
    );
  });

  it("refreshes expired profile auth before command execution", async () => {
    const config = upsertProfile(await loadConfig(env), "default", {
      host: "http://localhost:3000",
      token: "expired-token",
      tokenExpiresAt: "2026-03-09T19:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2026-04-08T20:00:00.000Z",
    });
    await saveConfig(config, env);
    requestJson.mockResolvedValue({
      ok: true,
      data: {
        accessToken: "fresh-token",
        accessTokenExpiresAt: "2099-03-09T20:00:00.000Z",
        refreshToken: "session.next",
        refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
        session: {
          id: "session-1",
          label: "Laptop",
          email: "person@example.com",
          domain: "example.com",
        },
      },
    });

    const refreshed = await refreshProfileAuth({
      config,
      profileName: "default",
      host: "http://localhost:3000",
      timeoutMs: 30_000,
      env,
    });

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/auth/cli/refresh",
      body: { refreshToken: "session.secret" },
    });
    expect(refreshed.token).toBe("fresh-token");
    expect(getProfileConfig(refreshed.config, "default")).toMatchObject({
      token: "fresh-token",
      refreshToken: "session.next",
      cliSessionId: "session-1",
    });
  });

  it("uses a keychain-backed refresh token when config omits the secret", async () => {
    const config = upsertProfile(await loadConfig(env), "default", {
      host: "http://localhost:3000",
      token: "expired-token",
      tokenExpiresAt: "2026-03-09T19:00:00.000Z",
      refreshTokenExpiresAt: "2026-04-08T20:00:00.000Z",
    });
    await saveConfig(config, env);
    mockedResolveProfileConfigSecrets.mockResolvedValueOnce({
      ...getProfileConfig(config, "default"),
      refreshToken: "session.secret",
    });
    requestJson.mockResolvedValue({
      ok: true,
      data: {
        accessToken: "fresh-token",
        accessTokenExpiresAt: "2099-03-09T20:00:00.000Z",
        refreshToken: "session.next",
        refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
        session: {
          id: "session-1",
          label: "Laptop",
          email: "person@example.com",
          domain: "example.com",
        },
      },
    });

    await refreshProfileAuth({
      config,
      profileName: "default",
      host: "http://localhost:3000",
      timeoutMs: 30_000,
      env,
    });

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/auth/cli/refresh",
      body: { refreshToken: "session.secret" },
    });
  });

  it("reuses a still-valid access token without consulting keychain storage", async () => {
    const config = upsertProfile(await loadConfig(env), "default", {
      host: "http://localhost:3000",
      token: "fresh-token",
      tokenExpiresAt: "2099-03-09T19:00:00.000Z",
      refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
    });

    const refreshed = await refreshProfileAuth({
      config,
      profileName: "default",
      host: "http://localhost:3000",
      timeoutMs: 30_000,
      env,
    });

    expect(refreshed.token).toBe("fresh-token");
    expect(mockedResolveProfileConfigSecrets).not.toHaveBeenCalled();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it("clears stale stored auth when refresh is rejected", async () => {
    const config = upsertProfile(await loadConfig(env), "default", {
      host: "http://localhost:3000",
      token: "expired-token",
      tokenExpiresAt: "2026-03-09T19:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
    });
    const cleared = clearProfileToken(config, "default");
    await saveConfig(config, env);
    requestJson.mockRejectedValue(new CliError("Unauthorized", EXIT_CODES.auth));

    const refreshed = await refreshProfileAuth({
      config,
      profileName: "default",
      host: "http://localhost:3000",
      timeoutMs: 30_000,
      env,
    });

    expect(getProfileConfig(refreshed.config, "default")).toEqual(
      getProfileConfig(cleared, "default"),
    );
    expect(refreshed.token).toBeUndefined();
    expect(mockedClearStoredRefreshToken).toHaveBeenCalledWith(
      "default",
      "http://localhost:3000",
      { env },
    );
  });

  it("preserves stored refresh auth on transient refresh failures", async () => {
    const config = upsertProfile(await loadConfig(env), "default", {
      host: "http://localhost:3000",
      token: "expired-token",
      tokenExpiresAt: "2026-03-09T19:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
    });
    await saveConfig(config, env);
    requestJson.mockRejectedValue(new CliError("Request timed out", EXIT_CODES.transport));

    await expect(
      refreshProfileAuth({
        config,
        profileName: "default",
        host: "http://localhost:3000",
        timeoutMs: 30_000,
        env,
      }),
    ).rejects.toMatchObject({
      message: "Request timed out",
      exitCode: EXIT_CODES.transport,
    });

    const persisted = await loadConfig(env);
    expect(getProfileConfig(persisted, "default")).toMatchObject({
      token: "expired-token",
      refreshToken: "session.secret",
    });
  });

  it("normalizes blank session labels to the default login label", () => {
    expect(normalizeRequestedSessionLabel("   ")).toContain("IG CLI on ");
    expect(normalizeRequestedSessionLabel("  Laptop  ")).toBe("Laptop");
  });
});
