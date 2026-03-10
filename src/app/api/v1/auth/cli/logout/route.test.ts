import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/auth/cli", () => ({
  CliAuthServiceError: class CliAuthServiceError extends Error {
    readonly status: 400 | 401 | 404 | 503;

    constructor(status: 400 | 401 | 404 | 503, message: string) {
      super(message);
      this.status = status;
    }
  },
  revokeCliSessionByRefreshToken: vi.fn(),
}));

import { POST } from "@/app/api/v1/auth/cli/logout/route";
import { revokeCliSessionByRefreshToken } from "@/services/auth/cli";

const mockedRevoke = vi.mocked(revokeCliSessionByRefreshToken);

describe("POST /api/v1/auth/cli/logout", () => {
  beforeEach(() => {
    mockedRevoke.mockReset();
  });

  it("returns 400 for invalid request bodies", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns logout status", async () => {
    mockedRevoke.mockResolvedValue(true);

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: "session.secret" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { loggedOut: true, revoked: true },
    });
  });
});
