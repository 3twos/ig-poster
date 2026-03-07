import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MetaMediaPreflightError,
  preflightMetaMediaForPublish,
} from "@/lib/meta-media-preflight";

describe("preflightMetaMediaForPublish", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-https media URLs", async () => {
    await expect(
      preflightMetaMediaForPublish(
        { mode: "image", imageUrl: "http://cdn.example.com/poster.jpg" },
        { probeRemote: false },
      ),
    ).rejects.toBeInstanceOf(MetaMediaPreflightError);
  });

  it("rejects localhost/private network media URLs", async () => {
    await expect(
      preflightMetaMediaForPublish(
        { mode: "image", imageUrl: "https://localhost/poster.jpg" },
        { probeRemote: false },
      ),
    ).rejects.toThrow("public host");
  });

  it("falls back to range GET when HEAD is not allowed", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 206,
          headers: { "content-type": "video/mp4" },
        }),
      );

    await expect(
      preflightMetaMediaForPublish({
        mode: "reel",
        videoUrl: "https://cdn.example.com/reel.mp4",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("rejects when probed content-type does not match expected media type", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      preflightMetaMediaForPublish({
        mode: "image",
        imageUrl: "https://cdn.example.com/poster.jpg",
      }),
    ).rejects.toThrow("must return image content-type");
  });
});
