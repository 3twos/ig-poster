import { afterEach, describe, expect, it, vi } from "vitest";

import { runPublishCommand } from "@/cli/commands/publish";

describe("runPublishCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes an image with a resolved location query", async () => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          locations: [
            {
              id: "loc-1",
              name: "Napa Valley Welcome Center",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          publish: {
            status: "scheduled",
            mode: "image",
            authSource: "oauth",
            connectionId: "conn-1",
            publishAt: "2026-03-10T18:30:00.000Z",
            id: "job-1",
          },
        },
      });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPublishCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [
        "--image",
        "https://cdn.example.com/poster.png",
        "--caption",
        "Launch day caption",
        "--location",
        "Napa Valley Welcome Center",
        "--schedule",
        "2026-03-10T18:30:00.000Z",
        "--connection",
        "conn-1",
      ],
    );

    expect(requestJson).toHaveBeenNthCalledWith(1, {
      method: "GET",
      path:
        "/api/v1/meta/locations?q=Napa+Valley+Welcome+Center&connectionId=conn-1",
    });
    expect(requestJson).toHaveBeenNthCalledWith(2, {
      method: "POST",
      path: "/api/v1/publish",
      body: {
        caption: "Launch day caption",
        publishAt: "2026-03-10T18:30:00.000Z",
        locationId: "loc-1",
        connectionId: "conn-1",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/poster.png",
        },
      },
    });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("status: scheduled"));
  });

  it("passes dry-run for reels and preserves share-to-feed=false", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        publish: {
          status: "validated",
          mode: "reel",
          authSource: "env",
          scheduled: false,
          publishAt: null,
        },
      },
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPublishCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: false,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: true,
        },
      } as never,
      [
        "--video",
        "https://cdn.example.com/reel.mp4",
        "--caption",
        "Launch day caption",
        "--no-share-to-feed",
      ],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/publish",
      body: {
        caption: "Launch day caption",
        dryRun: true,
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: false,
        },
      },
    });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("status: validated"));
  });

  it("serializes carousel urls and prints json output when requested", async () => {
    const requestJson = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        publish: {
          status: "published",
          mode: "carousel",
          authSource: "oauth",
          publishId: "publish-1",
          creationId: "creation-1",
          children: ["child-1", "child-2"],
        },
      },
    });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runPublishCommand(
      {
        client: { requestJson },
        globalOptions: {
          json: true,
          jq: undefined,
          quiet: false,
          noColor: false,
          yes: false,
          dryRun: false,
        },
      } as never,
      [
        "--carousel",
        "https://cdn.example.com/c1.jpg,https://cdn.example.com/c2.mp4",
        "--caption",
        "Launch day caption",
      ],
    );

    expect(requestJson).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/v1/publish",
      body: {
        caption: "Launch day caption",
        media: {
          mode: "carousel",
          items: [
            {
              mediaType: "image",
              url: "https://cdn.example.com/c1.jpg",
            },
            {
              mediaType: "video",
              url: "https://cdn.example.com/c2.mp4",
            },
          ],
        },
      },
    });
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"status": "published"'));
  });
});
