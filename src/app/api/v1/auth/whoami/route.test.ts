import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

import { GET } from "@/app/api/v1/auth/whoami/route";
import { resolveActorFromRequest } from "@/services/actors";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);

describe("GET /api/v1/auth/whoami", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
  });

  it("returns 401 when no actor is available", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/auth/whoami"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("returns the authenticated actor envelope", async () => {
    mockedResolveActor.mockResolvedValue({
      type: "workspace-user",
      subjectId: "user-1",
      email: "person@example.com",
      domain: "example.com",
      ownerHash: "hash",
      authSource: "bearer",
      scopes: ["posts:read"],
      issuedAt: "2026-03-08T10:00:00.000Z",
      expiresAt: "2026-03-08T11:00:00.000Z",
    });

    const response = await GET(
      new Request("https://app.example.com/api/v1/auth/whoami"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        actor: {
          email: "person@example.com",
          authSource: "bearer",
        },
      },
    });
  });
});
