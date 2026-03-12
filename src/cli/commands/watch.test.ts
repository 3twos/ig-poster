import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "@/cli/errors";
import { runWatchCommand } from "@/cli/commands/watch";

describe("runWatchCommand", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-watch-"));
    await writeFile(path.join(tempDir, "hero.png"), "png-bytes", "utf8");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("ingests supported files once and returns a json summary", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          asset: {
            id: "assets/hero.png",
            pathname: "assets/hero.png",
            name: "hero.png",
            url: "https://cdn.example.com/hero.png",
            size: 8,
            folder: "assets",
            contentType: "image/png",
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          post: {
            id: "post_1",
            title: "hero",
            status: "draft",
          },
        },
      });

    const exitCode = await runWatchCommand(
      {
        client: { requestJson },
        projectLink: null,
        globalOptions: {
          json: true,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [tempDir],
    );

    expect(exitCode).toBe(EXIT_CODES.ok);
    expect(requestJson).toHaveBeenNthCalledWith(1, {
      method: "POST",
      path: "/api/v1/assets",
      body: expect.any(FormData),
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/api/v1/posts",
      body: expect.objectContaining({
        title: "hero",
      }),
    });
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"processedCount": 1'),
    );
  });

  it("emits stream-json lifecycle events in once mode", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          asset: {
            id: "assets/hero.png",
            pathname: "assets/hero.png",
            name: "hero.png",
            url: "https://cdn.example.com/hero.png",
            size: 8,
            folder: "assets",
            contentType: "image/png",
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          post: {
            id: "post_1",
            title: "hero",
            status: "draft",
          },
        },
      });

    const exitCode = await runWatchCommand(
      {
        client: { requestJson },
        projectLink: null,
        globalOptions: {
          json: false,
          streamJson: true,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [tempDir, "--once"],
    );

    expect(exitCode).toBe(EXIT_CODES.ok);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"scan-start"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"asset-uploaded"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"post-created"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"type":"done"'),
    );
  });
});
