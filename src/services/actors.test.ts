import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
  verifyWorkspaceSessionToken: vi.fn(),
}));

vi.mock("@/services/auth/cli", () => ({
  verifyCliAccessToken: vi.fn(),
}));

import {
  resolveActorFromRequest,
} from "@/services/actors";
import {
  readWorkspaceSessionFromRequest,
  verifyWorkspaceSessionToken,
} from "@/lib/workspace-auth";
import { verifyCliAccessToken } from "@/services/auth/cli";

const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedVerifyToken = vi.mocked(verifyWorkspaceSessionToken);
const mockedVerifyCliAccessToken = vi.mocked(verifyCliAccessToken);

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
    mockedVerifyCliAccessToken.mockReset();
  });

  it("prefers CLI bearer auth over cookie auth", async () => {
    mockedVerifyCliAccessToken.mockResolvedValue({
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

    const actor = await resolveActorFromRequest(
      new Request("https://app.example.com/api/v1/posts", {
        headers: { authorization: "Bearer token-123" },
      }),
    );

    expect(mockedVerifyCliAccessToken).toHaveBeenCalledWith("token-123");
    expect(mockedReadWorkspace).not.toHaveBeenCalled();
    expect(actor).toMatchObject({
      authSource: "bearer",
      email: "person@example.com",
    });
  });

  it("falls back to legacy workspace bearer tokens when a CLI bearer token is invalid", async () => {
    mockedVerifyCliAccessToken.mockResolvedValue(null);
    mockedVerifyToken.mockResolvedValue(session);

    const actor = await resolveActorFromRequest(
      new Request("https://app.example.com/api/v1/posts", {
        headers: { authorization: "Bearer workspace-token" },
      }),
    );

    expect(actor).toMatchObject({
      authSource: "bearer",
      email: "person@example.com",
    });
  });

  it("does not fall back to cookies when a bearer token is invalid", async () => {
    mockedVerifyCliAccessToken.mockResolvedValue(null);
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
