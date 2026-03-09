import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getConfigPath,
  getProfileConfig,
  loadConfig,
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
});
