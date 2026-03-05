import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getEnvMetaAuth, getMediaInsights } from "@/lib/meta";

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
