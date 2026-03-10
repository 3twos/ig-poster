import { describe, expect, it, vi } from "vitest";

import {
  clearStoredRefreshToken,
  loadStoredRefreshToken,
  resolveProfileConfigSecrets,
  saveStoredRefreshToken,
} from "@/cli/secure-storage";

describe("secure storage helpers", () => {
  it("writes refresh tokens through expect-driven prompt input so they stay out of argv", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const stored = await saveStoredRefreshToken("default", "http://localhost:3000", "session.secret", {
      platform: "darwin",
      run,
    });

    expect(stored).toBe(true);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "/usr/bin/expect",
        stdin: "session.secret\n",
      }),
    );
    expect(run).toHaveBeenCalledWith({
      command: "/usr/bin/expect",
      args: [
        "-c",
        expect.any(String),
        "/usr/bin/security",
        "add-generic-password",
        "-U",
        "-s",
        "ig-poster-cli-refresh-token",
        "-a",
        "default@http://localhost:3000",
        "-w",
      ],
      stdin: "session.secret\n",
    });
  });

  it("canonicalizes hosts before reading or writing keychain entries", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    await saveStoredRefreshToken(
      "default",
      "HTTPS://Example.COM:443/",
      "session.secret",
      {
        platform: "darwin",
        run,
      },
    );

    expect(run).toHaveBeenCalledWith({
      command: "/usr/bin/expect",
      args: [
        "-c",
        expect.any(String),
        "/usr/bin/security",
        "add-generic-password",
        "-U",
        "-s",
        "ig-poster-cli-refresh-token",
        "-a",
        "default@https://example.com",
        "-w",
      ],
      stdin: "session.secret\n",
    });
  });

  it("loads and trims stored refresh tokens from keychain", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: "session.secret\n",
      stderr: "",
    });

    await expect(
      loadStoredRefreshToken("default", "http://localhost:3000", {
        platform: "darwin",
        run,
      }),
    ).resolves.toBe("session.secret");
  });

  it("treats a missing keychain item as an absent refresh token", async () => {
    const run = vi.fn().mockRejectedValue(
      Object.assign(
        new Error("The specified item could not be found in the keychain."),
        {
          stderr:
            "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.",
        },
      ),
    );

    await expect(
      loadStoredRefreshToken("default", "http://localhost:3000", {
        platform: "darwin",
        run,
      }),
    ).resolves.toBeUndefined();
  });

  it("surfaces non-missing keychain lookup failures", async () => {
    const run = vi.fn().mockRejectedValue(
      Object.assign(new Error("User interaction is not allowed."), {
        stderr: "security: User interaction is not allowed.",
      }),
    );

    await expect(
      loadStoredRefreshToken("default", "http://localhost:3000", {
        platform: "darwin",
        run,
      }),
    ).rejects.toThrow(
      "Failed to load refresh token from macOS Keychain. Unlock the keychain, allow the `security` CLI to access it, or set IG_POSTER_DISABLE_KEYCHAIN=1 to use config-file storage instead.",
    );
  });

  it("returns no secure value when keychain support is disabled", async () => {
    const run = vi.fn();

    await expect(
      loadStoredRefreshToken("default", "http://localhost:3000", {
        platform: "linux",
        run,
      }),
    ).resolves.toBeUndefined();
    await expect(
      saveStoredRefreshToken("default", "http://localhost:3000", "session.secret", {
        platform: "linux",
        run,
      }),
    ).resolves.toBe(false);
    await expect(
      clearStoredRefreshToken("default", "http://localhost:3000", {
        platform: "linux",
        run,
      }),
    ).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("hydrates profile config with a keychain refresh token when needed", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: "session.secret\n",
      stderr: "",
    });

    const profile = await resolveProfileConfigSecrets(
      {
        version: 1,
        defaultProfile: "default",
        profiles: {
          default: {
            host: "http://localhost:3000",
            refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
          },
        },
      },
      "default",
      "http://localhost:3000",
      {
        platform: "darwin",
        run,
      },
    );

    expect(profile.refreshToken).toBe("session.secret");
    expect(profile.refreshTokenExpiresAt).toBe("2099-04-08T20:00:00.000Z");
  });

  it("ignores config-file refresh tokens when the resolved host changes", async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: "session.secret.next\n",
      stderr: "",
    });

    const profile = await resolveProfileConfigSecrets(
      {
        version: 1,
        defaultProfile: "default",
        profiles: {
          default: {
            host: "https://old.example.com/",
            refreshToken: "session.secret.old",
            refreshTokenExpiresAt: "2099-04-08T20:00:00.000Z",
          },
        },
      },
      "default",
      "https://new.example.com",
      {
        platform: "darwin",
        run,
      },
    );

    expect(profile.refreshToken).toBe("session.secret.next");
    expect(run).toHaveBeenCalledWith({
      args: [
        "find-generic-password",
        "-s",
        "ig-poster-cli-refresh-token",
        "-a",
        "default@https://new.example.com",
        "-w",
      ],
    });
  });

  it("trusts config-file refresh tokens when the host matches after normalization", async () => {
    const run = vi.fn();

    const profile = await resolveProfileConfigSecrets(
      {
        version: 1,
        defaultProfile: "default",
        profiles: {
          default: {
            host: "HTTPS://Example.COM:443/",
            refreshToken: "session.secret",
          },
        },
      },
      "default",
      "https://example.com",
      {
        platform: "darwin",
        run,
      },
    );

    expect(profile.refreshToken).toBe("session.secret");
    expect(run).not.toHaveBeenCalled();
  });
});
