import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runPostsCommand } from "@/cli/commands/posts";

describe("runPostsCommand", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-posts-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("sends patch payloads to the v1 update endpoint", async () => {
    const patchPath = path.join(tempDir, "patch.json");
    await writeFile(patchPath, JSON.stringify({ title: "Updated" }), "utf8");

    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: { post: { id: "post-1", title: "Updated", status: "draft" } },
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPostsCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["update", "post-1", "--patch", `@${patchPath}`],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "PATCH",
      path: "/api/v1/posts/post-1",
      body: { title: "Updated" },
    });
    expect(stdout).toHaveBeenCalled();
  });

  it("calls the duplicate endpoint", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: { post: { id: "copy-1", title: "Launch Copy", status: "generated" } },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runPostsCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["duplicate", "post-1"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/posts/post-1/duplicate",
    });
  });

  it("calls the archive endpoint", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: { post: { id: "post-1", title: "Launch", status: "archived" } },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runPostsCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: true,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["archive", "post-1"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/posts/post-1/archive",
    });
  });
});
