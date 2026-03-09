import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

vi.mock("@/services/auth/cli", () => ({
  CliAuthServiceError: class CliAuthServiceError extends Error {
    readonly status: 400 | 401 | 404 | 503;

    constructor(status: 400 | 401 | 404 | 503, message: string) {
      super(message);
      this.status = status;
    }
  },
  ensureCliAuthReady: vi.fn(),
  createCliAuthorizationCode: vi.fn(),
}));

import { GET } from "@/app/api/v1/auth/cli/start/route";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import {
  createCliAuthorizationCode,
  ensureCliAuthReady,
} from "@/services/auth/cli";

const mockedReadWorkspaceSession = vi.mocked(readWorkspaceSessionFromRequest);
const mockedEnsureCliAuthReady = vi.mocked(ensureCliAuthReady);
const mockedCreateCliAuthorizationCode = vi.mocked(createCliAuthorizationCode);

describe("GET /api/v1/auth/cli/start", () => {
  beforeEach(() => {
    mockedReadWorkspaceSession.mockReset();
    mockedEnsureCliAuthReady.mockReset();
    mockedCreateCliAuthorizationCode.mockReset();
  });

  it("redirects unauthenticated users through Google auth", async () => {
    mockedReadWorkspaceSession.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "https://app.example.com/api/v1/auth/cli/start?challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&state=state-1234&redirect_uri=http://127.0.0.1:43123/callback",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/api/auth/google/start");
    expect(response.headers.get("location")).toContain(
      "next=%2Fapi%2Fv1%2Fauth%2Fcli%2Fstart%3Fchallenge%3Daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("redirects back to the local callback with a CLI code", async () => {
    mockedReadWorkspaceSession.mockResolvedValue({
      sub: "user-1",
      email: "person@example.com",
      domain: "example.com",
      issuedAt: "2026-03-08T10:00:00.000Z",
      expiresAt: "2026-03-08T22:00:00.000Z",
    });
    mockedCreateCliAuthorizationCode.mockResolvedValue("code-123");

    const response = await GET(
      new Request(
        "https://app.example.com/api/v1/auth/cli/start?challenge=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&state=state-5678&redirect_uri=http://127.0.0.1:43123/callback",
      ),
    );

    expect(mockedCreateCliAuthorizationCode).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:43123/callback?code=code-123&state=state-5678",
    );
  });

  it("returns 400 for invalid requests", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/v1/auth/cli/start?state=short"),
    );

    expect(response.status).toBe(400);
  });
});
