import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/status", () => ({
  getApiStatus: vi.fn(),
}));

import { GET } from "@/app/api/v1/status/route";
import { resolveActorFromRequest } from "@/services/actors";
import { getApiStatus } from "@/services/status";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedGetApiStatus = vi.mocked(getApiStatus);

describe("GET /api/v1/status", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedGetApiStatus.mockReset();
  });

  it("returns 401 when no actor is available", async () => {
    mockedResolveActor.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/status"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("returns the aggregated status envelope", async () => {
    mockedResolveActor.mockResolvedValueOnce({
      ownerHash: "hash",
      email: "person@example.com",
    } as never);
    mockedGetApiStatus.mockResolvedValueOnce({
      actor: {
        type: "workspace-user",
        subjectId: "user-1",
        email: "person@example.com",
        domain: "example.com",
        authSource: "bearer",
        scopes: ["posts:read"],
        issuedAt: "2026-03-10T10:00:00.000Z",
        expiresAt: "2026-03-10T11:00:00.000Z",
      },
      meta: {
        connected: true,
        source: "oauth",
      },
      llm: {
        connected: true,
        mode: "fallback",
        connections: [],
        source: null,
      },
      publishWindow: {
        available: true,
        limit: 50,
        used: 4,
        remaining: 46,
        windowStart: "2026-03-09T12:00:00.000Z",
      },
    });

    const response = await GET(
      new Request("https://app.example.com/api/v1/status"),
    );

    expect(response.status).toBe(200);
    expect(mockedGetApiStatus).toHaveBeenCalledWith(
      expect.objectContaining({ email: "person@example.com" }),
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        actor: {
          email: "person@example.com",
        },
        publishWindow: {
          remaining: 46,
        },
      },
    });
  });
});
