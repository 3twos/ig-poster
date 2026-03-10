import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/cli/auth", () => ({
  loginWithBrowser: vi.fn(),
  persistCliAuthTokens: vi.fn((config, profileName, host, tokens) => ({
    ...config,
    profiles: {
      ...config.profiles,
      [profileName]: {
        ...(config.profiles[profileName] ?? {}),
        host,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        cliSessionId: tokens.session.id,
      },
    },
  })),
}));

import { runAuthCommand } from "@/cli/commands/auth";
import { loadConfig } from "@/cli/config";
import { loginWithBrowser } from "@/cli/auth";

const mockedLoginWithBrowser = vi.mocked(loginWithBrowser);

describe("runAuthCommand", () => {
  let configDir: string;

  beforeEach(async () => {
    configDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-auth-cmd-"));
    process.env.IG_POSTER_CONFIG_DIR = configDir;
    mockedLoginWithBrowser.mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.IG_POSTER_CONFIG_DIR;
    await rm(configDir, { recursive: true, force: true });
  });

  it("runs browser login when no manual token source is provided", async () => {
    mockedLoginWithBrowser.mockResolvedValue({
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
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runAuthCommand(
      {
        config: await loadConfig(),
        profileName: "default",
        profileConfig: {},
        host: "http://localhost:3000",
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["login"],
    );

    expect(mockedLoginWithBrowser).toHaveBeenCalled();
    const saved = await loadConfig();
    expect(saved.profiles.default).toMatchObject({
      token: "access-token",
      refreshToken: "session.secret",
      cliSessionId: "session-1",
    });
  });

  it("lists CLI sessions", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        sessions: [
          {
            id: "session-1",
            label: "Laptop",
            email: "person@example.com",
            domain: "example.com",
            lastUsedAt: "2026-03-09T19:30:00.000Z",
            expiresAt: "2026-04-08T19:30:00.000Z",
            revokedAt: null,
          },
        ],
      },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runAuthCommand(
      {
        client: { requestJson },
        config: await loadConfig(),
        profileName: "default",
        profileConfig: {},
        host: "http://localhost:3000",
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["sessions", "list"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/v1/auth/sessions",
    });
  });

  it("logs out persisted refresh sessions remotely and clears local state", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: { loggedOut: true, revoked: true },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runAuthCommand(
      {
        client: { requestJson },
        config: {
          version: 1,
          defaultProfile: "default",
          profiles: {
            default: {
              host: "http://localhost:3000",
              token: "access-token",
              refreshToken: "session.secret",
            },
          },
        },
        profileName: "default",
        profileConfig: {
          host: "http://localhost:3000",
          token: "access-token",
          refreshToken: "session.secret",
        },
        host: "http://localhost:3000",
        globalOptions: {
          json: false,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["logout"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/auth/cli/logout",
      body: { refreshToken: "session.secret" },
    });
    const saved = await loadConfig();
    expect(saved.profiles.default).toEqual({
      host: "http://localhost:3000",
    });
  });
});
