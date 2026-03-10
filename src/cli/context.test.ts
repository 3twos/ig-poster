import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/cli/config", () => ({
  getProfileConfig: vi.fn(
    (config: { profiles: Record<string, Record<string, unknown>> }, profileName: string) =>
      config.profiles[profileName] ?? {},
  ),
  getProfileName: vi.fn(() => "default"),
  loadConfig: vi.fn(),
  resolveHost: vi.fn(() => "https://igposter.3twos.com"),
  resolveToken: vi.fn(() => "cached-token"),
  saveConfig: vi.fn(),
}));

vi.mock("@/cli/auth", () => ({
  loginWithBrowser: vi.fn(),
  persistCliAuthTokens: vi.fn(),
  refreshProfileAuth: vi.fn(),
}));

vi.mock("@/cli/project", () => ({
  loadProjectLink: vi.fn(async () => null),
}));

vi.mock("@/cli/secure-storage", () => ({
  resolveProfileConfigSecrets: vi.fn(),
}));

vi.mock("@/cli/client", () => ({
  IgPosterClient: vi.fn(function IgPosterClientMock(options: Record<string, unknown>) {
    return { options };
  }),
}));

import { createContext } from "@/cli/context";
import { loadConfig, saveConfig } from "@/cli/config";
import {
  loginWithBrowser,
  persistCliAuthTokens,
  refreshProfileAuth,
} from "@/cli/auth";
import { resolveProfileConfigSecrets } from "@/cli/secure-storage";
import { EXIT_CODES } from "@/cli/errors";

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedSaveConfig = vi.mocked(saveConfig);
const mockedRefreshProfileAuth = vi.mocked(refreshProfileAuth);
const mockedLoginWithBrowser = vi.mocked(loginWithBrowser);
const mockedPersistCliAuthTokens = vi.mocked(persistCliAuthTokens);
const mockedResolveProfileConfigSecrets = vi.mocked(resolveProfileConfigSecrets);

describe("createContext", () => {
  const baseConfig = {
    version: 1 as const,
    defaultProfile: "default",
    profiles: {
      default: {
        host: "https://igposter.3twos.com",
      },
    },
  };
  const originalStdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const originalStderrTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

  beforeEach(() => {
    mockedLoadConfig.mockReset();
    mockedSaveConfig.mockReset();
    mockedRefreshProfileAuth.mockReset();
    mockedLoginWithBrowser.mockReset();
    mockedPersistCliAuthTokens.mockReset();
    mockedResolveProfileConfigSecrets.mockReset();
    mockedLoadConfig.mockResolvedValue(baseConfig);
    mockedRefreshProfileAuth.mockResolvedValue({
      config: baseConfig,
      profileConfig: baseConfig.profiles.default,
      token: "cached-token",
    });
    mockedResolveProfileConfigSecrets.mockResolvedValue(baseConfig.profiles.default);
    setTTY(process.stdin, true);
    setTTY(process.stderr, true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreTTY(process.stdin, originalStdinTTY);
    restoreTTY(process.stderr, originalStderrTTY);
  });

  it("uses the existing auth token without triggering browser login", async () => {
    const ctx = await createContext(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
    );

    expect(mockedRefreshProfileAuth).toHaveBeenCalled();
    expect(mockedLoginWithBrowser).not.toHaveBeenCalled();
    expect(ctx.token).toBe("cached-token");
    expect(
      (ctx.client as unknown as { options: { token: string } }).options.token,
    ).toBe(
      "cached-token",
    );
  });

  it("bootstraps browser login when an auth-required command has no session", async () => {
    const tokens = {
      accessToken: "fresh-token",
      accessTokenExpiresAt: "2099-03-09T20:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
      session: {
        id: "session-1",
        label: "Laptop",
        email: "person@example.com",
        domain: "example.com",
      },
    };
    const nextConfig = {
      ...baseConfig,
      profiles: {
        default: {
          ...baseConfig.profiles.default,
          token: "fresh-token",
        },
      },
    };
    mockedRefreshProfileAuth.mockResolvedValueOnce({
      config: baseConfig,
      profileConfig: baseConfig.profiles.default,
      token: undefined,
    });
    mockedLoginWithBrowser.mockResolvedValueOnce(tokens);
    mockedPersistCliAuthTokens.mockResolvedValueOnce(nextConfig);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const ctx = await createContext(
      {
        json: true,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
    );

    expect(stderr).toHaveBeenCalledWith(
      'No IG Poster CLI session found for profile "default". Opening browser login...\n',
    );
    expect(mockedLoginWithBrowser).toHaveBeenCalledWith({
      host: "https://igposter.3twos.com",
      timeoutMs: 120_000,
    });
    expect(mockedPersistCliAuthTokens).toHaveBeenCalledWith(
      baseConfig,
      "default",
      "https://igposter.3twos.com",
      tokens,
    );
    expect(mockedSaveConfig).toHaveBeenCalledWith(nextConfig);
    expect(ctx.token).toBe("fresh-token");
    expect(
      (ctx.client as unknown as { options: { token: string } }).options.token,
    ).toBe(
      "fresh-token",
    );
  });

  it("fails with an auth error in non-interactive mode when bootstrap login is needed", async () => {
    mockedRefreshProfileAuth.mockResolvedValueOnce({
      config: baseConfig,
      profileConfig: baseConfig.profiles.default,
      token: undefined,
    });
    setTTY(process.stdin, false);
    setTTY(process.stderr, false);

    await expect(
      createContext({
        json: true,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      }),
    ).rejects.toMatchObject({
      message:
        "Authentication required. Run `ig auth login` interactively first, or set IG_POSTER_TOKEN.",
      exitCode: EXIT_CODES.auth,
    });

    expect(mockedLoginWithBrowser).not.toHaveBeenCalled();
    expect(mockedPersistCliAuthTokens).not.toHaveBeenCalled();
  });

  it("does not trigger browser login for commands that skip auth refresh", async () => {
    const ctx = await createContext(
      {
        json: false,
        streamJson: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
      { refreshAuth: false },
    );

    expect(mockedRefreshProfileAuth).not.toHaveBeenCalled();
    expect(mockedResolveProfileConfigSecrets).toHaveBeenCalled();
    expect(mockedLoginWithBrowser).not.toHaveBeenCalled();
    expect(ctx.token).toBe("cached-token");
  });
});

const setTTY = (
  stream: NodeJS.ReadStream | NodeJS.WriteStream,
  value: boolean,
) => {
  Object.defineProperty(stream, "isTTY", {
    configurable: true,
    value,
  });
};

const restoreTTY = (
  stream: NodeJS.ReadStream | NodeJS.WriteStream,
  descriptor?: PropertyDescriptor,
) => {
  if (descriptor) {
    Object.defineProperty(stream, "isTTY", descriptor);
    return;
  }

  // `isTTY` is configurable in tests, so deleting it restores the default prototype lookup.
  delete (stream as { isTTY?: boolean }).isTTY;
};
