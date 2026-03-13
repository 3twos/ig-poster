import { describe, expect, it, vi } from "vitest";

import {
  APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
  ApplePhotosBridgeRequestError,
  getApplePhotosFallbackInfo,
  importApplePhotosSelection,
  isMacOsUserAgent,
  listRecentApplePhotos,
  openApplePhotosCompanion,
  probeApplePhotosBridge,
  searchApplePhotos,
} from "@/lib/apple-photos";
import { buildApplePhotosBridgeHealthResponse } from "@/lib/apple-photos-bridge";

describe("isMacOsUserAgent", () => {
  it("detects macOS desktop browsers", () => {
    expect(
      isMacOsUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
      ),
    ).toBe(true);
  });

  it("does not treat non-macOS platforms as supported", () => {
    expect(
      isMacOsUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      ),
    ).toBe(false);
  });

  it("does not treat iPhone Safari as macOS", () => {
    expect(
      isMacOsUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });
});

describe("getApplePhotosFallbackInfo", () => {
  it("returns a companion-required fallback on macOS", () => {
    expect(
      getApplePhotosFallbackInfo(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
      ),
    ).toMatchObject({
      code: "MACOS_COMPANION_REQUIRED",
      actionLabel: "Use regular upload",
    });
  });

  it("returns a bridge-unavailable fallback on macOS when probing fails", () => {
    expect(
      getApplePhotosFallbackInfo(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
        "MACOS_BRIDGE_UNAVAILABLE",
      ),
    ).toMatchObject({
      code: "MACOS_BRIDGE_UNAVAILABLE",
      actionLabel: "Use regular upload",
    });
  });

  it("returns an unsupported-platform fallback elsewhere", () => {
    expect(
      getApplePhotosFallbackInfo(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      ),
    ).toMatchObject({
      code: "UNSUPPORTED_PLATFORM",
      actionLabel: "Use regular upload",
    });
  });
});

describe("probeApplePhotosBridge", () => {
  it("returns launch metadata when the local bridge is healthy", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(buildApplePhotosBridgeHealthResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      probeApplePhotosBridge({
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
        returnTo: "https://ig-poster.example.com/drafts/post_123",
      }),
    ).resolves.toMatchObject({
      available: true,
      health: buildApplePhotosBridgeHealthResponse(),
      launchUrl: expect.stringContaining("igposter-companion://photos/pick"),
    });
  });

  it("reports bridge-unavailable when the probe fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("bridge offline");
    });

    await expect(
      probeApplePhotosBridge({
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
      }),
    ).resolves.toMatchObject({
      available: false,
      code: "MACOS_BRIDGE_UNAVAILABLE",
    });
  });

  it("rejects health payloads that advertise a different origin", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ...health,
          bridge: {
            ...health.bridge,
            origin: "http://127.0.0.1:9999",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      probeApplePhotosBridge({
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
      }),
    ).resolves.toMatchObject({
      available: false,
      code: "MACOS_BRIDGE_UNAVAILABLE",
      message: "The local Apple Photos bridge advertised an unexpected origin.",
    });
  });

  it("accepts older bridge health payloads without companion metadata", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const legacyHealth = { ...health };
    const legacyBridge = { ...health.bridge };
    delete legacyHealth.companionApp;
    delete legacyBridge.openCompanionUrl;
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ...legacyHealth,
          bridge: legacyBridge,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      probeApplePhotosBridge({
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
      }),
    ).resolves.toMatchObject({
      available: true,
      health: {
        bridge: {
          origin: health.bridge.origin,
        },
      },
      launchUrl: expect.stringContaining("igposter-companion://photos/pick"),
    });
  });
});

describe("importApplePhotosSelection", () => {
  it("downloads imported assets from the local bridge manifest", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === health.bridge.pickUrl) {
        return new Response(
          JSON.stringify({
            importedAt: "2026-03-13T17:00:00Z",
            assets: [
              {
                id: "export_123",
                filename: "hero.jpg",
                mediaType: "image",
                createdAt: "2026-03-13T17:00:00Z",
                favorite: false,
                albumNames: [],
                exportPath: "/tmp/hero.jpg",
                downloadUrl: `${health.bridge.origin}/v1/photos/exports/export_123`,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url === `${health.bridge.origin}/v1/photos/exports/export_123`) {
        return new Response(new Blob(["image-bytes"], { type: "image/jpeg" }), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      importApplePhotosSelection({ fetchImpl: fetchImpl as typeof fetch }),
    ).resolves.toMatchObject({
      importedAt: "2026-03-13T17:00:00Z",
      assets: [
        expect.objectContaining({
          id: "export_123",
          filename: "hero.jpg",
        }),
      ],
      files: [expect.objectContaining({ name: "hero.jpg", type: "image/jpeg" })],
    });
  });

  it("posts selected ids to the import route when requested", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === health.bridge.importUrl) {
        expect(init?.body).toBe(JSON.stringify({ ids: ["export_123"] }));
        return new Response(
          JSON.stringify({
            importedAt: "2026-03-13T17:05:00Z",
            assets: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      importApplePhotosSelection({
        fetchImpl: fetchImpl as typeof fetch,
        ids: ["export_123"],
      }),
    ).resolves.toMatchObject({
      importedAt: "2026-03-13T17:05:00Z",
      assets: [],
      files: [],
    });
  });

  it("rejects unexpected bridge import payloads", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === health.bridge.pickUrl) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      importApplePhotosSelection({ fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toThrow(
      "The local Apple Photos bridge returned an unexpected import payload.",
    );
  });
});

describe("openApplePhotosCompanion", () => {
  it("asks the local bridge to open the native companion", async () => {
    const health = buildApplePhotosBridgeHealthResponse({
      companionApp: {
        installed: true,
        bundlePath: "/Applications/IG Poster Companion.app",
      },
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === health.bridge.openCompanionUrl) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({
            action: "pick",
            returnTo: "https://ig-poster.example.com/drafts/post_123",
            draftId: "post_123",
            profile: "default",
          }),
        );

        return new Response(
          JSON.stringify({
            launchedAt: "2026-03-13T19:00:00Z",
            launchUrl:
              "igposter-companion://photos/pick?draft_id=post_123&profile=default",
            companionApp: {
              installed: true,
              bundlePath: "/Applications/IG Poster Companion.app",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      openApplePhotosCompanion({
        fetchImpl: fetchImpl as typeof fetch,
        returnTo: "https://ig-poster.example.com/drafts/post_123",
        draftId: "post_123",
        profile: "default",
      }),
    ).resolves.toMatchObject({
      launchedAt: "2026-03-13T19:00:00Z",
      companionApp: {
        installed: true,
        bundlePath: "/Applications/IG Poster Companion.app",
      },
    });
  });

  it("accepts bridge open responses without a companion bundle path", async () => {
    const health = buildApplePhotosBridgeHealthResponse({
      companionApp: {
        installed: true,
      },
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === health.bridge.openCompanionUrl) {
        return new Response(
          JSON.stringify({
            launchedAt: "2026-03-13T19:05:00Z",
            launchUrl: "igposter-companion://photos/pick",
            companionApp: {
              installed: true,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(
      openApplePhotosCompanion({
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toMatchObject({
      launchedAt: "2026-03-13T19:05:00Z",
      companionApp: {
        installed: true,
      },
    });
  });
});

describe("listRecentApplePhotos", () => {
  it("queries the local recent endpoint with typed filters", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.toString()).toContain(health.bridge.recentUrl);
      expect(url.searchParams.get("since")).toBe("7d");
      expect(url.searchParams.get("limit")).toBe("5");
      expect(url.searchParams.get("media")).toBe("image");
      expect(url.searchParams.get("favorite")).toBe("true");

      return new Response(
        JSON.stringify({
          assets: [],
          fetchedAt: "2026-03-13T18:20:00Z",
          query: {
            mode: "recent",
            since: "7d",
            limit: 5,
            mediaType: "image",
            favorite: true,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    await expect(
      listRecentApplePhotos({
        fetchImpl: fetchImpl as typeof fetch,
        since: "7d",
        limit: 5,
        mediaType: "image",
        favorite: true,
      }),
    ).resolves.toMatchObject({
      query: {
        mode: "recent",
        limit: 5,
      },
    });
  });
});

describe("searchApplePhotos", () => {
  it("queries the local search endpoint with album filters", async () => {
    const health = buildApplePhotosBridgeHealthResponse();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof URL ? input : new URL(String(input));
      expect(url.toString()).toContain(health.bridge.searchUrl);
      expect(url.searchParams.get("album")).toBe("Favorites");
      expect(url.searchParams.get("media")).toBe("video");

      return new Response(
        JSON.stringify({
          assets: [],
          fetchedAt: "2026-03-13T18:25:00Z",
          query: {
            mode: "search",
            album: "Favorites",
            limit: 20,
            mediaType: "video",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    await expect(
      searchApplePhotos({
        fetchImpl: fetchImpl as typeof fetch,
        album: "Favorites",
        mediaType: "video",
      }),
    ).resolves.toMatchObject({
      query: {
        mode: "search",
        album: "Favorites",
      },
    });
  });

  it("throws a typed bridge error for permission failures", async () => {
    const fetchImpl = vi.fn(async () =>
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
    );

    await expect(
      searchApplePhotos({
        fetchImpl: fetchImpl as typeof fetch,
        album: "Favorites",
      }),
    ).rejects.toMatchObject({
      name: ApplePhotosBridgeRequestError.name,
      status: 403,
      code: "PHOTOS_PERMISSION_REQUIRED",
      message: "Photos access is required.",
    });
  });
});
