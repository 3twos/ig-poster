import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteFacebookPagePost,
  getFacebookPagePublishState,
  getEnvMetaAuth,
  getMediaInsights,
  publishFacebookPageContent,
  publishInstagramContent,
  publishInstagramFirstComment,
  searchMetaLocations,
  updateFacebookPagePost,
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

  it("includes the page id when Meta page env configuration is present", () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "token");
    vi.stubEnv("INSTAGRAM_BUSINESS_ID", "biz-id");
    vi.stubEnv("META_PAGE_ID", "page-id");

    expect(getEnvMetaAuth()).toEqual({
      accessToken: "token",
      instagramUserId: "biz-id",
      pageId: "page-id",
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

  it("passes reel location metadata and user tags to Meta", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "creation_1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status_code: "FINISHED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "publish_1" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishInstagramContent(
        {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: true,
          caption: "Caption",
          locationId: "12345",
          userTags: [{ username: "handle", x: 0.4, y: 0.6 }],
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toMatchObject({
      mode: "reel",
      creationId: "creation_1",
      publishId: "publish_1",
    });

    const createCall = fetchMock.mock.calls[0];
    const createBody = createCall?.[1]?.body as URLSearchParams;
    expect(createBody.get("location_id")).toBe("12345");
    expect(createBody.get("user_tags")).toBe(
      JSON.stringify([{ username: "handle", x: 0.4, y: 0.6 }]),
    );
  });

  it("passes reel share_to_feed overrides to Meta", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "creation_1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status_code: "FINISHED" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "publish_1" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishInstagramContent(
        {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: false,
          caption: "Caption",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toMatchObject({
      mode: "reel",
      creationId: "creation_1",
      publishId: "publish_1",
    });

    const createCall = fetchMock.mock.calls[0];
    const createBody = createCall?.[1]?.body as URLSearchParams;
    expect(createBody.get("share_to_feed")).toBe("false");
  });
});

describe("publishFacebookPageContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes Facebook Page photos with url and caption", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "photo_1", post_id: "page_1_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishFacebookPageContent(
        {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
          caption: "Caption",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toMatchObject({
      mode: "image",
      creationId: "photo_1",
      publishId: "page_1_1",
    });

    const call = fetchMock.mock.calls[0];
    const body = call?.[1]?.body as URLSearchParams;
    expect(call?.[0]).toBe("https://graph.facebook.com/v22.0/page-id/photos");
    expect(body.get("url")).toBe("https://cdn.example.com/image.jpg");
    expect(body.get("caption")).toBe("Caption");
    expect(body.get("published")).toBe("true");
    expect(body.get("access_token")).toBe("token");
  });

  it("publishes Facebook Page videos with file_url and description", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishFacebookPageContent(
        {
          mode: "reel",
          videoUrl: "https://cdn.example.com/video.mp4",
          caption: "Caption",
          shareToFeed: false,
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toMatchObject({
      mode: "reel",
      creationId: "video_1",
      publishId: "video_1",
    });

    const call = fetchMock.mock.calls[0];
    const body = call?.[1]?.body as URLSearchParams;
    expect(call?.[0]).toBe("https://graph.facebook.com/v22.0/page-id/videos");
    expect(body.get("file_url")).toBe("https://cdn.example.com/video.mp4");
    expect(body.get("description")).toBe("Caption");
    expect(body.get("published")).toBe("true");
  });

  it("requires a connected Facebook Page id", async () => {
    await expect(
      publishFacebookPageContent(
        {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
          caption: "Caption",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          graphVersion: "v22.0",
        },
      ),
    ).rejects.toThrow("Missing Facebook Page id for publishing.");
  });

  it("rejects scheduled publishes outside Meta's 10 minute to 30 day window", async () => {
    await expect(
      publishFacebookPageContent(
        {
          mode: "image",
          imageUrl: "https://cdn.example.com/image.jpg",
          caption: "Caption",
          publishAt: new Date(Date.now() + 60_000).toISOString(),
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).rejects.toThrow(
      "Facebook scheduled publish time must be between 10 minutes and 30 days from now.",
    );
  });
});

describe("getFacebookPagePublishState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads published Facebook Page post state from the Graph API", async () => {
    const scheduledPublishTime = Math.floor(
      new Date("2026-03-13T18:00:00.000Z").getTime() / 1000,
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "photo_1",
        post_id: "page_1_1",
        is_published: true,
        permalink_url: "https://facebook.com/page/posts/1",
        scheduled_publish_time: scheduledPublishTime,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getFacebookPagePublishState(
        {
          publishId: "page_1_1",
          creationId: "photo_1",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toEqual({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: true,
      scheduledPublishTime: "2026-03-13T18:00:00.000Z",
      remotePermalink: "https://facebook.com/page/posts/1",
    });
  });

  it("falls back to creationId lookup when publishId lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "not found" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "video_1",
          published: false,
          scheduled_publish_time: "2026-03-13T18:00:00.000Z",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getFacebookPagePublishState(
        {
          publishId: "page_1_1",
          creationId: "video_1",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toEqual({
      remoteObjectId: "video_1",
      publishId: "page_1_1",
      creationId: "video_1",
      isPublished: false,
      scheduledPublishTime: "2026-03-13T18:00:00.000Z",
      remotePermalink: undefined,
    });
  });
});

describe("updateFacebookPagePost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates scheduled Facebook page posts by post id", async () => {
    const nextPublishAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "photo_1",
          post_id: "page_1_1",
          published: false,
          scheduled_publish_time: nextPublishAt,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateFacebookPagePost(
        {
          mediaMode: "image",
          publishId: "page_1_1",
          creationId: "photo_1",
          caption: "Updated caption",
          publishAt: nextPublishAt,
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toEqual({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: false,
      scheduledPublishTime: nextPublishAt,
      remotePermalink: undefined,
    });

    const updateCall = fetchMock.mock.calls[0];
    const updateBody = updateCall?.[1]?.body as URLSearchParams;
    expect(updateCall?.[0]).toBe("https://graph.facebook.com/v22.0/page_1_1");
    expect(updateBody.get("message")).toBe("Updated caption");
    expect(updateBody.get("published")).toBe("false");
    expect(updateBody.get("published_content_type")).toBe("SCHEDULED");
  });

  it("falls back to creation id update when post id update fails", async () => {
    const nextPublishAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "not found" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "not found" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "video_1",
          published: false,
          scheduled_publish_time: nextPublishAt,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateFacebookPagePost(
        {
          mediaMode: "reel",
          publishId: "page_1_1",
          creationId: "video_1",
          caption: "Updated caption",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toEqual({
      remoteObjectId: "video_1",
      publishId: "page_1_1",
      creationId: "video_1",
      isPublished: false,
      scheduledPublishTime: nextPublishAt,
      remotePermalink: undefined,
    });

    const fallbackCall = fetchMock.mock.calls[1];
    const fallbackBody = fallbackCall?.[1]?.body as URLSearchParams;
    expect(fallbackCall?.[0]).toBe("https://graph.facebook.com/v22.0/video_1");
    expect(fallbackBody.get("description")).toBe("Updated caption");
  });

  it("treats success-false responses as failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false }),
      }),
    );

    await expect(
      updateFacebookPagePost(
        {
          mediaMode: "image",
          publishId: "page_1_1",
          caption: "Updated caption",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).rejects.toThrow("Meta API call failed on page_1_1");
  });
});

describe("deleteFacebookPagePost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes scheduled Facebook page posts by post id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      deleteFacebookPagePost(
        {
          publishId: "page_1_1",
          creationId: "photo_1",
        },
        {
          accessToken: "token",
          instagramUserId: "ig-id",
          pageId: "page-id",
          graphVersion: "v22.0",
        },
      ),
    ).resolves.toEqual({
      deletedId: "page_1_1",
    });

    const deleteCall = fetchMock.mock.calls[0];
    expect(String(deleteCall?.[0])).toBe(
      "https://graph.facebook.com/v22.0/page_1_1?access_token=token",
    );
    expect(deleteCall?.[1]).toMatchObject({
      method: "DELETE",
    });
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
