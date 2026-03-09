import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearProfileToken,
  getConfigPath,
  getProfileConfig,
  loadConfig,
  parseConfigHost,
  resolveHost,
  resolveToken,
  saveConfig,
  upsertProfile,
} from "@/cli/config";

describe("cli config", () => {
  let configDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    configDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-"));
    env = { ...process.env, IG_POSTER_CONFIG_DIR: configDir };
  });

  afterEach(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  it("returns a default config when the file does not exist", async () => {
    const config = await loadConfig(env);

    expect(config.defaultProfile).toBe("default");
    expect(getConfigPath(env)).toBe(path.join(configDir, "config.json"));
  });

  it("persists and resolves profile host/token overrides", async () => {
    const config = upsertProfile(await loadConfig(env), "staging", {
      host: "https://ig.example.com",
      token: "secret-token",
    });
    await saveConfig(config, env);

    const loaded = await loadConfig(env);

    expect(getProfileConfig(loaded, "staging")).toMatchObject({
      host: "https://ig.example.com",
      token: "secret-token",
    });
    expect(resolveHost(loaded, "staging", undefined, env)).toBe(
      "https://ig.example.com",
    );
    expect(resolveToken(loaded, "staging", env)).toBe("secret-token");
  });

  it("removes a persisted token during logout", async () => {
    const config = upsertProfile(await loadConfig(env), "staging", {
      host: "https://ig.example.com",
      token: "secret-token",
      tokenExpiresAt: "2026-03-09T20:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2026-04-08T20:00:00.000Z",
      email: "person@example.com",
      domain: "example.com",
      cliSessionId: "session-1",
      cliSessionLabel: "Laptop",
    });
    const cleared = clearProfileToken(config, "staging");

    expect(getProfileConfig(cleared, "staging")).toEqual({
      host: "https://ig.example.com",
    });
  });

  it("writes config with restrictive directory and file permissions", async () => {
    await saveConfig(await loadConfig(env), env);

    const fileStats = await stat(getConfigPath(env));
    const dirStats = await stat(configDir);

    expect(fileStats.mode & 0o777).toBe(0o600);
    expect(dirStats.mode & 0o777).toBe(0o700);
  });

  it("rejects unsupported host protocols", () => {
    expect(() => parseConfigHost("ftp://ig.example.com")).toThrow(
      "Host must use http or https",
    );
  });
});
