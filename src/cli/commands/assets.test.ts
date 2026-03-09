import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAssetsCommand } from "@/cli/commands/assets";

describe("runAssetsCommand", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "ig-poster-assets-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("uploads a file to the v1 assets endpoint as multipart form-data", async () => {
    const filePath = path.join(tempDir, "clip.mov");
    await writeFile(filePath, "video-bytes", "utf8");

    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        asset: {
          id: "videos/123-clip.mov",
          name: "clip.mov",
          url: "https://blob.example.com/clip.mov",
          pathname: "videos/123-clip.mov",
          size: 11,
          folder: "videos",
          contentType: "video/quicktime",
        },
      },
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await runAssetsCommand(
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
      ["upload", filePath, "--folder", "videos"],
    );

    const request = requestJson.mock.calls[0]?.[0];
    expect(request?.method).toBe("POST");
    expect(request?.path).toBe("/api/v1/assets");
    expect(request?.body).toBeInstanceOf(FormData);
    const formData = request?.body as FormData;
    expect(formData.get("folder")).toBe("videos");
    const file = formData.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("clip.mov");
    expect((file as File).type).toBe("video/quicktime");
  });

  it("rejects unsupported local file types before uploading", async () => {
    const filePath = path.join(tempDir, "notes.txt");
    await writeFile(filePath, "text", "utf8");

    await expect(
      runAssetsCommand(
        {
          client: { requestJson: vi.fn() },
          globalOptions: {
            json: false,
            quiet: false,
            noColor: false,
            yes: false,
            dryRun: false,
          },
        } as never,
        ["upload", filePath],
      ),
    ).rejects.toThrow("Unsupported file type for upload: notes.txt");
  });
});
