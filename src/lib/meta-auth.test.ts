import { afterEach, describe, expect, it, vi } from "vitest";

import { META_CONNECTION_COOKIE, resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import { encryptString } from "@/lib/secure";

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
});
