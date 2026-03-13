import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meta-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-auth")>(
    "@/lib/meta-auth",
  );

  return {
    ...actual,
    completeMetaOAuth: vi.fn(),
  };
});

import { GET } from "@/app/api/auth/meta/callback/route";
import {
  completeMetaOAuth,
  META_CONNECTION_COOKIE,
  META_OAUTH_STATE_COOKIE,
} from "@/lib/meta-auth";

const mockedCompleteMetaOAuth = vi.mocked(completeMetaOAuth);

describe("GET /api/auth/meta/callback", () => {
  beforeEach(() => {
    mockedCompleteMetaOAuth.mockReset();
  });

  it("redirects to an error when the callback is missing code or state", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/auth/meta/callback?state=state-123"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/?auth=error&detail=Missing%20OAuth%20code%20or%20state",
    );
    expect(mockedCompleteMetaOAuth).not.toHaveBeenCalled();
  });

  it("rejects callbacks whose state does not match the signed cookie", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/meta/callback?state=wrong-state&code=code-123",
        {
          headers: {
            cookie: `${META_OAUTH_STATE_COOKIE}=expected-state`,
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/?auth=error&detail=Invalid%20OAuth%20state",
    );
    expect(mockedCompleteMetaOAuth).not.toHaveBeenCalled();
  });

  it("stores the connection cookie and clears the state cookie after a successful callback", async () => {
    mockedCompleteMetaOAuth.mockResolvedValue({
      cookieValue: "stored-connection-123",
      account: {
        instagramUserId: "ig-1",
      },
    } as never);

    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/meta/callback?state=state-123&code=code-123&granted_scopes=pages_manage_posts,instagram_basic%20pages_manage_posts",
        {
          headers: {
            cookie: `${META_OAUTH_STATE_COOKIE}=state-123`,
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/?auth=connected",
    );
    expect(mockedCompleteMetaOAuth).toHaveBeenCalledWith(
      expect.any(Request),
      "code-123",
      ["instagram_basic", "pages_manage_posts"],
    );

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${META_CONNECTION_COOKIE}=stored-connection-123`);
    expect(setCookie).toContain(`${META_OAUTH_STATE_COOKIE}=;`);
  });

  it("redirects to an error when Meta OAuth completion fails", async () => {
    mockedCompleteMetaOAuth.mockRejectedValue(
      new Error("Multiple Facebook Pages matched this OAuth grant"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/auth/meta/callback?state=state-123&code=code-123",
        {
          headers: {
            cookie: `${META_OAUTH_STATE_COOKIE}=state-123`,
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/?auth=error&detail=Multiple%20Facebook%20Pages%20matched%20this%20OAuth%20grant",
    );
  });
});
