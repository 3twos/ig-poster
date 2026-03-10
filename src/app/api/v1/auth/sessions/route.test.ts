import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/auth/cli", () => ({
  CliAuthServiceError: class CliAuthServiceError extends Error {
    readonly status: 400 | 401 | 404 | 503;

    constructor(status: 400 | 401 | 404 | 503, message: string) {
      super(message);
      this.status = status;
    }
  },
  listCliSessions: vi.fn(),
}));

import { GET } from "@/app/api/v1/auth/sessions/route";
import { resolveActorFromRequest } from "@/services/actors";
import { listCliSessions } from "@/services/auth/cli";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedListCliSessions = vi.mocked(listCliSessions);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "bearer" as const,
  scopes: ["posts:read"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("GET /api/v1/auth/sessions", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedListCliSessions.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/auth/sessions"),
    );

    expect(response.status).toBe(401);
  });

  it("returns the caller's CLI sessions", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedListCliSessions.mockResolvedValue([
      {
        id: "session-1",
        label: "Laptop",
        email: "person@example.com",
        domain: "example.com",
        scopes: ["posts:read"],
        createdAt: "2026-03-09T19:00:00.000Z",
        lastUsedAt: "2026-03-09T19:30:00.000Z",
        expiresAt: "2026-04-08T19:30:00.000Z",
        revokedAt: null,
        userAgent: "ig-cli/test",
      },
    ]);

    const response = await GET(
      new Request("https://app.example.com/api/v1/auth/sessions"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        sessions: [{ id: "session-1", label: "Laptop" }],
      },
    });
  });
});
