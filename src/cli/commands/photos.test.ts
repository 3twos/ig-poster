import { afterEach, describe, expect, it, vi } from "vitest";

import { runPhotosCommand } from "@/cli/commands/photos";
import { EXIT_CODES } from "@/cli/errors";

describe("runPhotosCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prints recent Apple Photos results in json mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof URL ? input : new URL(String(input));
        expect(url.pathname).toBe("/v1/photos/recent");
        expect(url.searchParams.get("since")).toBe("7d");
        expect(url.searchParams.get("limit")).toBe("2");
        expect(url.searchParams.get("media")).toBe("image");

        return new Response(
          JSON.stringify({
            assets: [
              {
                id: "asset-1",
                filename: "IMG_0001.JPG",
                mediaType: "image",
                createdAt: "2026-03-13T18:00:00Z",
                width: 1080,
                height: 1350,
                favorite: true,
                albumNames: ["Favorites"],
              },
            ],
            fetchedAt: "2026-03-13T18:05:00Z",
            query: {
              mode: "recent",
              since: "7d",
              limit: 2,
              mediaType: "image",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPhotosCommand(
      {
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
      ["recent", "--since", "7d", "--limit", "2", "--media", "image"],
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"mode": "recent"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"filename": "IMG_0001.JPG"'),
    );
  });

  it("prints search results in human mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof URL ? input : new URL(String(input));
        expect(url.pathname).toBe("/v1/photos/search");
        expect(url.searchParams.get("album")).toBe("Favorites");
        expect(url.searchParams.get("favorite")).toBe("true");

        return new Response(
          JSON.stringify({
            assets: [
              {
                id: "asset-2",
                filename: "Weekend.mov",
                mediaType: "video",
                createdAt: "2026-03-12T18:00:00Z",
                durationMs: 5300,
                favorite: true,
                albumNames: ["Favorites", "Weekend"],
              },
            ],
            fetchedAt: "2026-03-13T18:15:00Z",
            query: {
              mode: "search",
              album: "Favorites",
              limit: 20,
              favorite: true,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPhotosCommand(
      {
        globalOptions: {
          json: false,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      ["search", "--album", "Favorites", "--favorite"],
    );

    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("mode: search"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("1. Weekend.mov (video)"),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining("albums: Favorites, Weekend"),
    );
  });

  it("maps Photos permission errors to a forbidden exit code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "PHOTOS_PERMISSION_REQUIRED",
            message: "Photos access is required.",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      runPhotosCommand(
        {
          globalOptions: {
            json: false,
            streamJson: false,
            jq: undefined,
            quiet: false,
            noColor: false,
            yes: false,
            dryRun: false,
          },
        } as never,
        ["recent"],
      ),
    ).rejects.toMatchObject({
      message: "Photos access is required.",
      exitCode: EXIT_CODES.forbidden,
    });
  });
});
