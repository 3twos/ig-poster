import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMetaOAuthStartUrl,
  META_CONNECTION_COOKIE,
  resolveMetaAuthFromRequest,
} from "@/lib/meta-auth";
import { encryptString } from "@/lib/secure";

describe("createMetaOAuthStartUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requests only the baseline Instagram-ready scopes by default", () => {
    vi.stubEnv("META_APP_ID", "app-id");
    vi.stubEnv("META_APP_SECRET", "app-secret");

    const url = createMetaOAuthStartUrl(
      "https://app.example.com",
      "state-123",
    );

    expect(url.searchParams.get("response_type")).toBe("code granted_scopes");
    expect(url.searchParams.get("scope")).toBe(
      "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
    );
    expect(url.searchParams.get("auth_type")).toBeNull();
  });

  it("can explicitly request Facebook Page publishing scopes during reconnect", () => {
    vi.stubEnv("META_APP_ID", "app-id");
    vi.stubEnv("META_APP_SECRET", "app-secret");

    const url = createMetaOAuthStartUrl("https://app.example.com", "state-123", {
      scopeProfile: "page-publishing",
    });

    expect(url.searchParams.get("scope")).toContain("pages_manage_posts");
    expect(url.searchParams.get("scope")).toContain("pages_manage_metadata");
    expect(url.searchParams.get("auth_type")).toBe("rerequest");
  });
});

describe("resolveMetaAuthFromRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("supports legacy inline OAuth cookies that predate page ids", async () => {
    vi.stubEnv("APP_ENCRYPTION_SECRET", "test-secret");
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    vi.stubEnv("INSTAGRAM_BUSINESS_ID", "");

    const encryptedPayload = encryptString(
      JSON.stringify({
        graphVersion: "v22.0",
        instagramUserId: "ig-legacy",
        instagramUsername: "legacy_handle",
        instagramName: "Legacy Account",
        pageName: "Legacy Page",
        tokenExpiresAt: "2026-04-10T00:00:00.000Z",
        accessToken: "legacy-token-123",
      }),
      "test-secret",
    );

    const req = new Request("https://app.example.com/api/auth/meta/status", {
      headers: {
        cookie: `${META_CONNECTION_COOKIE}=${encodeURIComponent(`inline:${encryptedPayload}`)}`,
      },
    });

    await expect(resolveMetaAuthFromRequest(req)).resolves.toEqual({
      source: "oauth",
      auth: {
        accessToken: "legacy-token-123",
        instagramUserId: "ig-legacy",
        graphVersion: "v22.0",
      },
      account: {
        accountKey: "ig-legacy",
        pageId: undefined,
        pageName: "Legacy Page",
        instagramUserId: "ig-legacy",
        instagramUsername: "legacy_handle",
        instagramName: "Legacy Account",
        tokenExpiresAt: "2026-04-10T00:00:00.000Z",
        capabilities: {
          facebook: {
            destination: "facebook",
            publishEnabled: false,
            syncMode: "remote_authoritative",
            sourceOfTruth: "meta",
          },
          instagram: {
            destination: "instagram",
            publishEnabled: true,
            syncMode: "app_managed",
            sourceOfTruth: "app",
          },
        },
      },
    });
  });

  it("disables facebook publishing when the granted scopes exclude page-post access", async () => {
    vi.stubEnv("APP_ENCRYPTION_SECRET", "test-secret");
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    vi.stubEnv("INSTAGRAM_BUSINESS_ID", "");

    const encryptedPayload = encryptString(
      JSON.stringify({
        graphVersion: "v22.0",
        pageId: "page-123",
        pageName: "Page 123",
        instagramUserId: "ig-123",
        instagramUsername: "modern_handle",
        instagramName: "Modern Account",
        grantedScopes: [
          "instagram_basic",
          "instagram_content_publish",
          "pages_read_engagement",
          "pages_show_list",
        ],
        accessToken: "modern-token-123",
      }),
      "test-secret",
    );

    const req = new Request("https://app.example.com/api/auth/meta/status", {
      headers: {
        cookie: `${META_CONNECTION_COOKIE}=${encodeURIComponent(`inline:${encryptedPayload}`)}`,
      },
    });

    await expect(resolveMetaAuthFromRequest(req)).resolves.toMatchObject({
      source: "oauth",
      account: {
        pageId: "page-123",
        accountKey: "page-123:ig-123",
        capabilities: {
          facebook: {
            publishEnabled: false,
          },
          instagram: {
            publishEnabled: true,
          },
        },
      },
    });
  });

  it("preserves legacy facebook publishing behavior when older cookies lack granted scopes", async () => {
    vi.stubEnv("APP_ENCRYPTION_SECRET", "test-secret");
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    vi.stubEnv("INSTAGRAM_BUSINESS_ID", "");

    const encryptedPayload = encryptString(
      JSON.stringify({
        graphVersion: "v22.0",
        pageId: "page-legacy",
        pageName: "Legacy Page",
        instagramUserId: "ig-legacy",
        instagramUsername: "legacy_page_handle",
        instagramName: "Legacy Page Account",
        accessToken: "legacy-page-token-123",
      }),
      "test-secret",
    );

    const req = new Request("https://app.example.com/api/auth/meta/status", {
      headers: {
        cookie: `${META_CONNECTION_COOKIE}=${encodeURIComponent(`inline:${encryptedPayload}`)}`,
      },
    });

    await expect(resolveMetaAuthFromRequest(req)).resolves.toMatchObject({
      source: "oauth",
      account: {
        pageId: "page-legacy",
        capabilities: {
          facebook: {
            publishEnabled: true,
          },
        },
      },
    });
  });
});
