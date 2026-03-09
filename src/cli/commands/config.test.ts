import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runConfigCommand } from "@/cli/commands/config";

describe("runConfigCommand", () => {
  let configDir: string;

  beforeEach(async () => {
    configDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-config-"));
    process.env.IG_POSTER_CONFIG_DIR = configDir;
  });

  afterEach(async () => {
    delete process.env.IG_POSTER_CONFIG_DIR;
    await rm(configDir, { recursive: true, force: true });
  });

  it("rejects invalid host urls before saving config", async () => {
    const ctx = {
      globalOptions: {
        json: false,
        quiet: false,
        noColor: false,
        yes: false,
        dryRun: false,
      },
    } as never;

    await expect(
      runConfigCommand(ctx, ["set", "host", "not-a-url"]),
    ).rejects.toMatchObject({
      message: "Invalid host URL: not-a-url",
    });
  });
});
