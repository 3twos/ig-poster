import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runQueueCommand } from "@/cli/commands/queue";

describe("runQueueCommand", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-queue-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists queue jobs through the v1 endpoint", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        jobs: [
          {
            id: "job-1",
            status: "queued",
            publishAt: "2026-03-10T18:30:00.000Z",
            attempts: 0,
            maxAttempts: 3,
            postId: "post-1",
          },
        ],
      },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runQueueCommand(
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
      ["list", "--status", "queued,failed", "--limit", "5"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/v1/publish-jobs?status=queued%2Cfailed&limit=5",
    });
  });

  it("calls the retry endpoint through PATCH", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        job: {
          id: "job-1",
          status: "queued",
          publishAt: "2026-03-10T18:30:00.000Z",
          postId: "post-1",
        },
      },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runQueueCommand(
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
      ["retry", "job-1"],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "PATCH",
      path: "/api/v1/publish-jobs/job-1",
      body: { action: "retry-now" },
    });
  });

  it("sends patch payloads to the v1 update endpoint", async () => {
    const patchPath = path.join(tempDir, "patch.json");
    await writeFile(
      patchPath,
      JSON.stringify({ action: "edit", caption: "Updated caption" }),
      "utf8",
    );

    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        job: {
          id: "job-1",
          status: "queued",
          publishAt: "2026-03-10T18:30:00.000Z",
          postId: "post-1",
        },
      },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runQueueCommand(
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
      ["update", "job-1", "--patch", `@${patchPath}`],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "PATCH",
      path: "/api/v1/publish-jobs/job-1",
      body: { action: "edit", caption: "Updated caption" },
    });
  });
});
