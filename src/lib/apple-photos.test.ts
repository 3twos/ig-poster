import { describe, expect, it, vi } from "vitest";

import {
  APPLE_PHOTOS_BRIDGE_PROBE_TIMEOUT_MS,
  getApplePhotosFallbackInfo,
  isMacOsUserAgent,
  probeApplePhotosBridge,
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
});
