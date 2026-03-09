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
  revokeCliSessionById: vi.fn(),
}));

import { POST } from "@/app/api/v1/auth/sessions/[id]/revoke/route";
import { resolveActorFromRequest } from "@/services/actors";
import {
  CliAuthServiceError,
  revokeCliSessionById,
} from "@/services/auth/cli";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedRevokeSession = vi.mocked(revokeCliSessionById);

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

describe("POST /api/v1/auth/sessions/:id/revoke", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedRevokeSession.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/sessions/session-1/revoke", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("maps service not-found errors", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedRevokeSession.mockRejectedValue(
      new CliAuthServiceError(404, "CLI session not found."),
    );

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/sessions/session-1/revoke", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns the revoked session", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedRevokeSession.mockResolvedValue({
      id: "session-1",
      label: "Laptop",
      email: "person@example.com",
      domain: "example.com",
      scopes: ["posts:read"],
      createdAt: "2026-03-09T19:00:00.000Z",
      lastUsedAt: "2026-03-09T19:30:00.000Z",
      expiresAt: "2026-04-08T19:30:00.000Z",
      revokedAt: "2026-03-09T19:31:00.000Z",
      userAgent: "ig-cli/test",
    });

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/sessions/session-1/revoke", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        session: { id: "session-1", revokedAt: "2026-03-09T19:31:00.000Z" },
      },
    });
  });
});
