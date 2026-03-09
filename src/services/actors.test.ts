import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
  verifyWorkspaceSessionToken: vi.fn(),
}));

import {
  resolveActorFromRequest,
} from "@/services/actors";
import {
  readWorkspaceSessionFromRequest,
  verifyWorkspaceSessionToken,
} from "@/lib/workspace-auth";

const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedVerifyToken = vi.mocked(verifyWorkspaceSessionToken);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("resolveActorFromRequest", () => {
  beforeEach(() => {
    mockedReadWorkspace.mockReset();
    mockedVerifyToken.mockReset();
  });

  it("prefers bearer auth over cookie auth", async () => {
    mockedVerifyToken.mockResolvedValue(session);

    const actor = await resolveActorFromRequest(
      new Request("https://app.example.com/api/v1/posts", {
        headers: { authorization: "Bearer token-123" },
      }),
    );

    expect(mockedVerifyToken).toHaveBeenCalledWith("token-123");
    expect(mockedReadWorkspace).not.toHaveBeenCalled();
    expect(actor).toMatchObject({
      authSource: "bearer",
      email: "person@example.com",
    });
  });

  it("does not fall back to cookies when a bearer token is invalid", async () => {
    mockedVerifyToken.mockResolvedValue(null);
    mockedReadWorkspace.mockResolvedValue(session);

    const actor = await resolveActorFromRequest(
      new Request("https://app.example.com/api/v1/posts", {
        headers: { authorization: "Bearer invalid" },
      }),
    );

    expect(actor).toBeNull();
    expect(mockedReadWorkspace).not.toHaveBeenCalled();
  });

  it("falls back to workspace cookies when no bearer token is present", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const actor = await resolveActorFromRequest(
      new Request("https://app.example.com/api/v1/posts"),
    );

    expect(actor).toMatchObject({
      authSource: "cookie",
      email: "person@example.com",
    });
  });
});
