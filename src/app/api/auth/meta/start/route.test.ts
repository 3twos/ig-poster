import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/meta/start/route";
import { META_OAUTH_STATE_COOKIE } from "@/lib/meta-auth";

describe("GET /api/auth/meta/start", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the Facebook-and-Instagram page-publishing scope profile", async () => {
    vi.stubEnv("META_APP_ID", "app-id");
    vi.stubEnv("META_APP_SECRET", "app-secret");

    const response = await GET(
      new Request("https://app.example.com/api/auth/meta/start"),
    );

    expect(response.status).toBe(307);

    const location = response.headers.get("location");
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toContain("/dialog/oauth");
    expect(redirectUrl.searchParams.get("scope")).toContain("instagram_basic");
    expect(redirectUrl.searchParams.get("scope")).toContain(
      "instagram_content_publish",
    );
    expect(redirectUrl.searchParams.get("scope")).toContain("pages_manage_posts");
    expect(redirectUrl.searchParams.get("scope")).toContain(
      "pages_manage_metadata",
    );
    expect(redirectUrl.searchParams.get("auth_type")).toBe("rerequest");
    expect(response.headers.get("set-cookie")).toContain(
      `${META_OAUTH_STATE_COOKIE}=`,
    );
  });

  it("still supports the narrower instagram-basic scope profile when explicitly requested", async () => {
    vi.stubEnv("META_APP_ID", "app-id");
    vi.stubEnv("META_APP_SECRET", "app-secret");

    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/meta/start?scopeProfile=instagram-basic",
      ),
    );

    expect(response.status).toBe(307);

    const location = response.headers.get("location");
    expect(location).not.toBeNull();

    const redirectUrl = new URL(location!);
    expect(redirectUrl.searchParams.get("scope")).toBe(
      "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
    );
    expect(redirectUrl.searchParams.get("auth_type")).toBeNull();
  });

  it("redirects back to the app with a clear error when Meta OAuth env vars are missing", async () => {
    vi.stubEnv("META_APP_ID", "");
    vi.stubEnv("META_APP_SECRET", "");

    const response = await GET(
      new Request("https://app.example.com/api/auth/meta/start"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/?auth=error&detail=Missing%20META_APP_ID%20or%20META_APP_SECRET",
    );
  });
});
