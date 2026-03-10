import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/auth/cli", () => ({
  CliAuthServiceError: class CliAuthServiceError extends Error {
    readonly status: 400 | 401 | 404 | 503;

    constructor(status: 400 | 401 | 404 | 503, message: string) {
      super(message);
      this.status = status;
    }
  },
  exchangeCliAuthorizationCode: vi.fn(),
}));

import { POST } from "@/app/api/v1/auth/cli/exchange/route";
import { exchangeCliAuthorizationCode } from "@/services/auth/cli";

const mockedExchange = vi.mocked(exchangeCliAuthorizationCode);

describe("POST /api/v1/auth/cli/exchange", () => {
  beforeEach(() => {
    mockedExchange.mockReset();
  });

  it("returns 400 for invalid request bodies", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "short" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns the issued CLI tokens", async () => {
    mockedExchange.mockResolvedValue({
      accessToken: "access-token",
      accessTokenExpiresAt: "2026-03-09T20:00:00.000Z",
      refreshToken: "session.secret",
      refreshTokenExpiresAt: "2026-04-08T20:00:00.000Z",
      session: {
        id: "session-1",
        label: "Laptop",
        email: "person@example.com",
        domain: "example.com",
        scopes: ["posts:read"],
        createdAt: "2026-03-09T19:00:00.000Z",
        lastUsedAt: "2026-03-09T19:00:00.000Z",
        expiresAt: "2026-04-08T20:00:00.000Z",
        revokedAt: null,
        userAgent: "ig-cli/test",
      },
    });

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "code-123",
          codeVerifier: "v".repeat(64),
          label: "Laptop",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        accessToken: "access-token",
        session: { id: "session-1", label: "Laptop" },
      },
    });
  });
});
