import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runLinkCommand, runUnlinkCommand } from "@/cli/commands/link";
import { loadProjectLink, loadProjectLinkAtDir } from "@/cli/project";

describe("link commands", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-link-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes a repo-local project link from the resolved context", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runLinkCommand(
      {
        host: "https://ig.example.com",
        profileName: "staging",
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["--brand-kit", "bk_123", "--output-dir", ".ig-poster/out"],
    );

    await expect(loadProjectLinkAtDir(tempDir)).resolves.toMatchObject({
      rootDir: tempDir,
      config: {
        host: "https://ig.example.com",
        profile: "staging",
        defaults: {
          brandKitId: "bk_123",
          outputDir: ".ig-poster/out",
        },
      },
    });
  });

  it("removes the nearest repo-local project link", async () => {
    const nestedDir = path.join(tempDir, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    process.chdir(nestedDir);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runLinkCommand(
      {
        host: "http://localhost:3000",
        profileName: "default",
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [],
    );
    await expect(loadProjectLink(nestedDir)).resolves.not.toBeNull();

    await runUnlinkCommand(
      {
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [],
    );

    await expect(loadProjectLink(nestedDir)).resolves.toBeNull();
  });

  it("rejects whitespace-only defaults instead of silently clearing them", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runLinkCommand(
      {
        host: "https://ig.example.com",
        profileName: "staging",
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["--brand-kit", "bk_123"],
    );

    await expect(
      runLinkCommand(
        {
          host: "https://ig.example.com",
          profileName: "staging",
          globalOptions: {
            json: true,
            quiet: false,
            noColor: false,
            yes: false,
            dryRun: false,
          },
        } as never,
        ["--brand-kit", "   "],
      ),
    ).rejects.toMatchObject({
      message: "--brand-kit must not be empty.",
    });

    await expect(loadProjectLinkAtDir(tempDir)).resolves.toMatchObject({
      config: {
        defaults: {
          brandKitId: "bk_123",
        },
      },
    });
  });
});
