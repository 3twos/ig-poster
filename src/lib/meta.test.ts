import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEnvMetaAuth,
  getMediaInsights,
  publishInstagramContent,
  publishInstagramFirstComment,
  searchMetaLocations,
} from "@/lib/meta";

describe("meta auth/env helpers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when env credentials are missing", () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    vi.stubEnv("INSTAGRAM_BUSINESS_ID", "");

    expect(getEnvMetaAuth()).toBeNull();
  });

  it("returns auth context when env credentials are present", () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "token");
    vi.stubEnv("INSTAGRAM_BUSINESS_ID", "biz-id");
    vi.stubEnv("META_GRAPH_VERSION", "v22.0");

    expect(getEnvMetaAuth()).toEqual({
      accessToken: "token",
      instagramUserId: "biz-id",
      graphVersion: "v22.0",
    });
  });
});

describe("getMediaInsights", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed metrics on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { name: "impressions", values: [{ value: 120 }] },
          { name: "reach", values: [{ value: 80 }] },
          { name: "likes", values: [{ value: 14 }] },
          { name: "comments", values: [{ value: 3 }] },
          { name: "saved", values: [{ value: 7 }] },
          { name: "shares", values: [{ value: 2 }] },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await getMediaInsights("media-1", {
      accessToken: "token",
      instagramUserId: "id",
      graphVersion: "v22.0",
    });

    expect(result).toEqual({
      impressions: 120,
      reach: 80,
      likes: 14,
      comments: 3,
      saves: 7,
      shares: 2,
    });
  });

  it("returns null when upstream response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    const result = await getMediaInsights("media-1", {
      accessToken: "token",
      instagramUserId: "id",
      graphVersion: "v22.0",
    });

    expect(result).toBeNull();
  });
});

describe("publishInstagramContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes location id and user tags for single-image publish", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "creation_1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "publish_1" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishInstagramContent(
        {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
          caption: "Caption",
          locationId: "12345",
          userTags: [{ username: "handle", x: 0.5, y: 0.5 }],
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toMatchObject({
      mode: "image",
      creationId: "creation_1",
      publishId: "publish_1",
    });

    const createCall = fetchMock.mock.calls[0];
    const createBody = createCall?.[1]?.body as URLSearchParams;
    expect(createCall?.[0]).toBe("https://graph.facebook.com/v22.0/ig-id/media");
    expect(createBody.get("image_url")).toBe("https://cdn.example.com/image.jpg");
    expect(createBody.get("caption")).toBe("Caption");
    expect(createBody.get("location_id")).toBe("12345");
    expect(createBody.get("user_tags")).toBe(
      JSON.stringify([{ username: "handle", x: 0.5, y: 0.5 }]),
    );
    expect(createBody.get("access_token")).toBe("token");
  });

  it("rejects location metadata for non-image modes", async () => {
    await expect(
      publishInstagramContent(
        {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          caption: "Caption",
          locationId: "12345",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          graphVersion: "v22.0",
        },
      ),
    ).rejects.toThrow(
      "Location and user tags are currently supported only for image posts.",
    );
  });
});

describe("publishInstagramFirstComment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a first comment and returns the comment id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "comment_1" }),
      }),
    );

    const result = await publishInstagramFirstComment(
      "media_1",
      "First!",
      {
        accessToken: "token",
        instagramUserId: "id",
        graphVersion: "v22.0",
      },
    );

    expect(result).toBe("comment_1");
  });

  it("throws when meta does not return a comment id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    await expect(
      publishInstagramFirstComment(
        "media_1",
        "First!",
        {
          accessToken: "token",
          instagramUserId: "id",
          graphVersion: "v22.0",
        },
      ),
    ).rejects.toThrow("Meta API did not return comment id");
  });
});

describe("searchMetaLocations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests place suggestions and returns normalized locations", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "12345",
            name: "Napa Valley Welcome Center",
            location: {
              city: "Napa",
              state: "CA",
              country: "United States",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const locations = await searchMetaLocations("napa", {
      accessToken: "token",
      instagramUserId: "ig-id",
      graphVersion: "v22.0",
    });

    expect(locations).toEqual([
      {
        id: "12345",
        name: "Napa Valley Welcome Center",
        city: "Napa",
        state: "CA",
        country: "United States",
      },
    ]);

    const call = fetchMock.mock.calls[0];
    const url = call?.[0] as URL;
    expect(url.toString()).toContain("https://graph.facebook.com/v22.0/search");
    expect(url.searchParams.get("type")).toBe("place");
    expect(url.searchParams.get("q")).toBe("napa");
    expect(url.searchParams.get("limit")).toBe("8");
    expect(url.searchParams.get("fields")).toBe("name,location");
    expect(url.searchParams.get("access_token")).toBe("token");
  });

  it("rejects short queries before calling Meta", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchMetaLocations("n", {
        accessToken: "token",
        instagramUserId: "ig-id",
        graphVersion: "v22.0",
      }),
    ).rejects.toThrow("Search query must be at least 2 characters.");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
