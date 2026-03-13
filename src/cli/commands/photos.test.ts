import { afterEach, describe, expect, it, vi } from "vitest";

import { IgPosterClient } from "@/cli/client";
import { runPhotosCommand } from "@/cli/commands/photos";
import { CliError, EXIT_CODES } from "@/cli/errors";

const createStreamResponse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );

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

  it("imports exported Photos assets and uploads them through the standard asset API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof URL ? input : new URL(String(input));

        if (url.pathname === "/v1/photos/import") {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(JSON.stringify({ ids: ["asset-1"] }));

          return new Response(
            JSON.stringify({
              importedAt: "2026-03-13T18:30:00Z",
              assets: [
                {
                  id: "asset-1",
                  filename: "IMG_1001.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-12T18:00:00Z",
                  favorite: false,
                  albumNames: ["Favorites"],
                  exportPath: "/tmp/IMG_1001.JPG",
                  downloadUrl: "http://127.0.0.1:43123/v1/photos/exports/asset-1",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (url.pathname === "/v1/photos/exports/asset-1") {
          return new Response(new Blob(["image-bytes"], { type: "image/jpeg" }), {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          });
        }

        throw new Error(`Unexpected URL: ${url.toString()}`);
      }),
    );
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        asset: {
          id: "assets/123-IMG_1001.JPG",
          name: "IMG_1001.JPG",
          url: "https://blob.example.com/IMG_1001.JPG",
          pathname: "assets/123-IMG_1001.JPG",
          size: 11,
          folder: "assets",
          contentType: "image/jpeg",
        },
      },
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPhotosCommand(
      {
        client: { requestJson },
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
      ["import", "--ids", "asset-1"],
    );

    expect(requestJson).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/api/v1/assets",
        body: expect.any(FormData),
      }),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"uploadedAssets"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"IMG_1001.JPG"'),
    );
  });

  it("proposes a draft from scored Apple Photos assets and runs generation", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-03-13T18:00:00Z"));
    const requestStream = vi
      .spyOn(IgPosterClient.prototype, "requestStream")
      .mockResolvedValue(
        createStreamResponse([
          {
            type: "run-start",
            runId: "run-1",
            label: "Generate",
          },
          {
            type: "run-complete",
            summary: "Generated draft concepts.",
            fallbackUsed: false,
            result: {
              strategy: "Lead with the strongest recent proof asset.",
              variants: [
                {
                  id: "variant-1",
                  name: "Hero",
                  postType: "single-image",
                  score: 0.91,
                },
                {
                  id: "variant-2",
                  name: "Editorial",
                  postType: "single-image",
                  score: 0.77,
                },
              ],
            },
          },
        ]),
      );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof URL ? input : new URL(String(input));

        if (url.pathname === "/v1/photos/recent") {
          return new Response(
            JSON.stringify({
              assets: [
                {
                  id: "asset-1",
                  filename: "IMG_1001.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-13T17:00:00Z",
                  favorite: false,
                  albumNames: ["Camera Roll"],
                },
                {
                  id: "asset-2",
                  filename: "IMG_1002.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-12T12:00:00Z",
                  favorite: true,
                  albumNames: ["Favorites"],
                },
                {
                  id: "asset-3",
                  filename: "Clip.mov",
                  mediaType: "video",
                  createdAt: "2026-03-13T17:30:00Z",
                  favorite: false,
                  albumNames: ["Camera Roll"],
                },
              ],
              fetchedAt: "2026-03-13T18:05:00Z",
              query: {
                mode: "recent",
                since: "7d",
                limit: 3,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (url.pathname === "/v1/photos/import") {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(JSON.stringify({ ids: ["asset-2", "asset-1"] }));

          return new Response(
            JSON.stringify({
              importedAt: "2026-03-13T18:10:00Z",
              assets: [
                {
                  id: "asset-2",
                  filename: "IMG_1002.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-12T12:00:00Z",
                  favorite: true,
                  albumNames: ["Favorites"],
                  exportPath: "/tmp/IMG_1002.JPG",
                  downloadUrl: "http://127.0.0.1:43123/v1/photos/exports/asset-2",
                },
                {
                  id: "asset-1",
                  filename: "IMG_1001.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-13T17:00:00Z",
                  favorite: false,
                  albumNames: ["Camera Roll"],
                  exportPath: "/tmp/IMG_1001.JPG",
                  downloadUrl: "http://127.0.0.1:43123/v1/photos/exports/asset-1",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (url.pathname === "/v1/photos/exports/asset-2") {
          return new Response(new Blob(["asset-2"], { type: "image/jpeg" }), {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          });
        }

        if (url.pathname === "/v1/photos/exports/asset-1") {
          return new Response(new Blob(["asset-1"], { type: "image/jpeg" }), {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          });
        }

        throw new Error(`Unexpected URL: ${url.toString()}`);
      }),
    );

    let uploadCall = 0;
    const requestJson = vi.fn(async (request: {
      path: string;
      body?: unknown;
    }) => {
      if (request.path === "/api/v1/assets") {
        uploadCall += 1;
        const fileName = uploadCall === 1 ? "IMG_1002.JPG" : "IMG_1001.JPG";
        return {
          ok: true,
          data: {
            asset: {
              id: `assets/${uploadCall}`,
              name: fileName,
              url: `https://blob.example.com/${fileName}`,
              pathname: `assets/${uploadCall}-${fileName}`,
              size: 7,
              folder: "assets",
              contentType: "image/jpeg",
            },
          },
        };
      }

      if (request.path === "/api/v1/posts") {
        expect(request.body).toMatchObject({
          title: "Weekly picks",
          brandKitId: "kit-1",
          assets: [
            expect.objectContaining({
              id: "assets/1",
              name: "IMG_1002.JPG",
              mediaType: "image",
            }),
            expect.objectContaining({
              id: "assets/2",
              name: "IMG_1001.JPG",
              mediaType: "image",
            }),
          ],
        });

        return {
          ok: true,
          data: {
            post: {
              id: "post-1",
              title: "Weekly picks",
              status: "draft",
            },
          },
        };
      }

      throw new Error(`Unexpected request path: ${request.path}`);
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPhotosCommand(
      {
        client: {
          requestJson,
        },
        host: "https://ig-poster.example.com",
        token: "cli-token",
        globalOptions: {
          json: true,
          streamJson: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
          timeoutMs: 1_000,
        },
      } as never,
      [
        "propose",
        "--since",
        "7d",
        "--limit",
        "3",
        "--count",
        "2",
        "--brand-kit",
        "kit-1",
        "--draft-title",
        "Weekly picks",
      ],
    );

    expect(requestStream).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/generate",
      headers: {
        accept: "text/event-stream",
      },
      body: { postId: "post-1" },
    });
    expect(
      (requestStream.mock.instances[0] as IgPosterClient | undefined)?.timeoutMs,
    ).toBe(120_000);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"draftUrl": "https://ig-poster.example.com/?post=post-1"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"topVariants"'),
    );
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining('"variant-1"'),
    );
  });

  it("preserves remote API CliError exit codes during propose failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof URL ? input : new URL(String(input));

        if (url.pathname === "/v1/photos/recent") {
          return new Response(
            JSON.stringify({
              assets: [
                {
                  id: "asset-1",
                  filename: "IMG_1001.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-13T17:00:00Z",
                  favorite: false,
                  albumNames: ["Camera Roll"],
                },
              ],
              fetchedAt: "2026-03-13T18:05:00Z",
              query: {
                mode: "recent",
                since: "7d",
                limit: 1,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (url.pathname === "/v1/photos/import") {
          return new Response(
            JSON.stringify({
              importedAt: "2026-03-13T18:10:00Z",
              assets: [
                {
                  id: "asset-1",
                  filename: "IMG_1001.JPG",
                  mediaType: "image",
                  createdAt: "2026-03-13T17:00:00Z",
                  favorite: false,
                  albumNames: ["Camera Roll"],
                  exportPath: "/tmp/IMG_1001.JPG",
                  downloadUrl: "http://127.0.0.1:43123/v1/photos/exports/asset-1",
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (url.pathname === "/v1/photos/exports/asset-1") {
          return new Response(new Blob(["asset-1"], { type: "image/jpeg" }), {
            status: 200,
            headers: { "Content-Type": "image/jpeg" },
          });
        }

        throw new Error(`Unexpected URL: ${url.toString()}`);
      }),
    );

    const requestJson = vi
      .fn()
      .mockRejectedValue(new CliError("Unauthorized", EXIT_CODES.auth));

    await expect(
      runPhotosCommand(
        {
          client: { requestJson },
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
        ["propose", "--since", "7d", "--limit", "1", "--count", "1"],
      ),
    ).rejects.toMatchObject({
      message: "Unauthorized",
      exitCode: EXIT_CODES.auth,
    });
  });
});
