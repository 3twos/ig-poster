import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getProjectLinkPath,
  loadProjectLink,
  removeProjectLink,
  saveProjectLink,
} from "@/cli/project";

describe("cli project link", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-cli-project-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("finds the nearest linked project from a nested working directory", async () => {
    const repoDir = path.join(tempDir, "repo");
    const nestedDir = path.join(repoDir, "packages", "app");
    await mkdir(nestedDir, { recursive: true });
    await saveProjectLink(repoDir, {
      host: "https://ig.example.com",
      profile: "staging",
      defaults: { brandKitId: "bk_123" },
    });

    const linked = await loadProjectLink(nestedDir);

    expect(linked).toMatchObject({
      rootDir: repoDir,
      configPath: getProjectLinkPath(repoDir),
      config: {
        host: "https://ig.example.com",
        profile: "staging",
        defaults: { brandKitId: "bk_123" },
      },
    });
  });

  it("removes a linked project file", async () => {
    const repoDir = path.join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });
    await saveProjectLink(repoDir, {
      host: "http://localhost:3000",
      profile: "default",
    });

    const removed = await removeProjectLink(repoDir);

    expect(removed?.configPath).toBe(getProjectLinkPath(repoDir));
    await expect(loadProjectLink(repoDir)).resolves.toBeNull();
  });
});
