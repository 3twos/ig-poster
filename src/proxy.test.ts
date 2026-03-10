import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/workspace-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workspace-auth")>(
    "@/lib/workspace-auth",
  );

  return {
    ...actual,
    verifyWorkspaceSessionToken: vi.fn(),
  };
});

import { proxy } from "@/proxy";
import { verifyWorkspaceSessionToken } from "@/lib/workspace-auth";

const mockedVerify = vi.mocked(verifyWorkspaceSessionToken);

describe("proxy", () => {
  beforeEach(() => {
    mockedVerify.mockReset();
  });

  it("rejects mutating API calls with mismatched origin", async () => {
    const req = new NextRequest("https://app.example.com/api/posts", {
      method: "POST",
      headers: {
        host: "app.example.com",
        origin: "https://evil.example.com",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "CSRF origin mismatch" });
  });

  it("lets public auth paths through without session", async () => {
    const req = new NextRequest("https://app.example.com/api/auth/google/status");
    const res = await proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it("lets CLI device approval paths through without session so the route can redirect", async () => {
    const req = new NextRequest("https://app.example.com/api/auth/cli/device/approve", {
      method: "POST",
    });
    const res = await proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it("lets CLI auth paths through without session", async () => {
    const req = new NextRequest(
      "https://app.example.com/api/v1/auth/cli/start?challenge=1234567890123456789012345678901234567890123&state=state1234&redirect_uri=http://127.0.0.1:3001/callback",
    );
    const res = await proxy(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated page requests to google start", async () => {
    const req = new NextRequest("https://app.example.com/settings");
    const res = await proxy(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/api/auth/google/start");
    expect(location).toContain("next=%2Fsettings");
  });

  it("allows authenticated API requests", async () => {
    mockedVerify.mockResolvedValue({
      sub: "u1",
      email: "person@example.com",
      domain: "example.com",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const req = new NextRequest("https://app.example.com/api/posts", {
      headers: {
        cookie: "workspace_session=token123",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockedVerify).toHaveBeenCalledWith("token123");
  });

  it("allows v1 API requests authenticated with bearer tokens", async () => {
    const req = new NextRequest("https://app.example.com/api/v1/posts", {
      headers: {
        authorization: "  Bearer header.payload.signature  ",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it("rejects malformed bearer tokens on v1 API requests", async () => {
    const req = new NextRequest("https://app.example.com/api/v1/posts", {
      headers: {
        authorization: "Bearer not-a-jwt",
      },
    });

    const res = await proxy(req);
    expect(res.status).toBe(401);
    expect(mockedVerify).not.toHaveBeenCalled();
  });
});
