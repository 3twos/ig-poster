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
  createCliDeviceCode: vi.fn(),
  ensureCliAuthReady: vi.fn(),
  createCliAuthorizationCode: vi.fn(),
}));

import { GET, POST } from "@/app/api/v1/auth/cli/start/route";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import {
  createCliDeviceCode,
  createCliAuthorizationCode,
  ensureCliAuthReady,
} from "@/services/auth/cli";

const mockedReadWorkspaceSession = vi.mocked(readWorkspaceSessionFromRequest);
const mockedCreateCliDeviceCode = vi.mocked(createCliDeviceCode);
const mockedEnsureCliAuthReady = vi.mocked(ensureCliAuthReady);
const mockedCreateCliAuthorizationCode = vi.mocked(createCliAuthorizationCode);

describe("GET /api/v1/auth/cli/start", () => {
  beforeEach(() => {
    mockedReadWorkspaceSession.mockReset();
    mockedCreateCliDeviceCode.mockReset();
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

  it("starts a device-code flow for CLI polling", async () => {
    mockedCreateCliDeviceCode.mockResolvedValue({
      deviceCode: "device-code-123",
      userCode: "ABCD-EFGH",
      verificationUri: "https://app.example.com/cli/device",
      verificationUriComplete:
        "https://app.example.com/cli/device?user_code=ABCD-EFGH",
      expiresAt: "2026-03-10T23:00:00.000Z",
      intervalSeconds: 5,
    });

    const response = await POST(
      new Request("https://app.example.com/api/v1/auth/cli/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "ig-cli/test",
        },
        body: JSON.stringify({
          grantType: "device_code",
          label: "Laptop",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockedCreateCliDeviceCode).toHaveBeenCalledWith({
      origin: "https://app.example.com",
      label: "Laptop",
      userAgent: "ig-cli/test",
    });
  });
});
