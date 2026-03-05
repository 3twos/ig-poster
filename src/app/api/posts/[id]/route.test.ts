import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { PUT } from "@/app/api/posts/[id]/route";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("PUT /api/posts/:id", () => {
  beforeEach(() => {
    mockedReadWorkspace.mockReset();
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid update payloads", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "broken-status" }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid request body" });
  });
});
