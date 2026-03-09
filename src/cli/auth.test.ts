import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestJson = vi.fn();

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

describe("cli auth helpers", () => {
  let configDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    configDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-auth-"));
    env = { ...process.env, IG_POSTER_CONFIG_DIR: configDir };
    requestJson.mockReset();
  });

  afterEach(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  it("persists browser-issued auth tokens with session metadata", async () => {
    const config = await loadConfig(env);
    const nextConfig = persistCliAuthTokens(config, "default", "http://localhost:3000", {
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
