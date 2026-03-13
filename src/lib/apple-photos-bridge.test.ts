import { describe, expect, it } from "vitest";

import {
  APPLE_PHOTOS_BRIDGE_BASE_PATH,
  APPLE_PHOTOS_BRIDGE_ORIGIN,
  APPLE_PHOTOS_BRIDGE_TOKEN_HEADER,
  APPLE_PHOTOS_COMPANION_APP_NAME,
  APPLE_PHOTOS_COMPANION_URL_SCHEME,
  buildApplePhotosBridgeHealthResponse,
  buildApplePhotosCompanionLaunchUrl,
  getApplePhotosBridgeUrls,
  parseApplePhotosCompanionLaunchUrl,
} from "@/lib/apple-photos-bridge";

describe("getApplePhotosBridgeUrls", () => {
  it("returns the default localhost bridge endpoints", () => {
    expect(getApplePhotosBridgeUrls()).toEqual({
      origin: APPLE_PHOTOS_BRIDGE_ORIGIN,
      healthUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/health`,
      recentUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/recent`,
      searchUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/search`,
      pickUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/pick`,
      importUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/import`,
    });
  });

  it("normalizes a custom origin before appending paths", () => {
    expect(getApplePhotosBridgeUrls("http://localhost:43123/")).toEqual({
      origin: "http://localhost:43123",
      healthUrl: `http://localhost:43123${APPLE_PHOTOS_BRIDGE_BASE_PATH}/health`,
      recentUrl: `http://localhost:43123${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/recent`,
      searchUrl: `http://localhost:43123${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/search`,
      pickUrl: `http://localhost:43123${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/pick`,
      importUrl: `http://localhost:43123${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/import`,
    });
  });
});

describe("buildApplePhotosBridgeHealthResponse", () => {
  it("advertises the shared bridge contract", () => {
    expect(buildApplePhotosBridgeHealthResponse()).toEqual({
      appName: APPLE_PHOTOS_COMPANION_APP_NAME,
      version: "v1",
      bridge: {
        origin: APPLE_PHOTOS_BRIDGE_ORIGIN,
        authTokenHeader: APPLE_PHOTOS_BRIDGE_TOKEN_HEADER,
        healthUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/health`,
        recentUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/recent`,
        searchUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/search`,
        pickUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/pick`,
        importUrl: `${APPLE_PHOTOS_BRIDGE_ORIGIN}${APPLE_PHOTOS_BRIDGE_BASE_PATH}/photos/import`,
      },
      capabilities: ["pick", "recent", "search", "import"],
    });
  });
});

describe("buildApplePhotosCompanionLaunchUrl", () => {
  it("encodes launch context for the native app", () => {
    const url = new URL(
      buildApplePhotosCompanionLaunchUrl("pick", {
        returnTo: "https://ig-poster.example.com/drafts/post_123",
        draftId: "post_123",
        profile: "default",
        bridgeOrigin: "http://localhost:43123/",
      }),
    );

    expect(url.protocol).toBe(`${APPLE_PHOTOS_COMPANION_URL_SCHEME}:`);
    expect(url.hostname).toBe("photos");
    expect(url.pathname).toBe("/pick");
    expect(url.searchParams.get("return_to")).toBe(
      "https://ig-poster.example.com/drafts/post_123",
    );
    expect(url.searchParams.get("draft_id")).toBe("post_123");
    expect(url.searchParams.get("profile")).toBe("default");
    expect(url.searchParams.get("bridge_origin")).toBe(
      "http://localhost:43123",
    );
  });
});

describe("parseApplePhotosCompanionLaunchUrl", () => {
  it("round-trips the shared launch URL contract", () => {
    const launchUrl = buildApplePhotosCompanionLaunchUrl("pick", {
      returnTo: "https://ig-poster.example.com/drafts/post_123",
      draftId: "post_123",
      profile: "default",
      bridgeOrigin: "http://localhost:43123/",
    });

    expect(parseApplePhotosCompanionLaunchUrl(launchUrl)).toEqual({
      action: "pick",
      returnTo: "https://ig-poster.example.com/drafts/post_123",
      draftId: "post_123",
      profile: "default",
      bridgeOrigin: "http://localhost:43123",
    });
  });

  it("rejects non-companion URLs", () => {
    expect(
      parseApplePhotosCompanionLaunchUrl(
        "https://ig-poster.example.com/drafts/post_123",
      ),
    ).toBeNull();
    expect(
      parseApplePhotosCompanionLaunchUrl("igposter-companion://photos/unknown"),
    ).toBeNull();
  });
});
