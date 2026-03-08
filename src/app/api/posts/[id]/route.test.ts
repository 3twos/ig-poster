import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { PUT } from "@/app/api/posts/[id]/route";
import { getDb } from "@/db";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedGetDb = vi.mocked(getDb);
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
    mockedGetDb.mockReset();
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

  it("ignores null mediaComposition updates so the db payload stays non-null", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const existing = {
      id: "p1",
      ownerHash: "owner",
      title: "Original",
      mediaComposition: {
        orientation: "portrait",
        items: [{ assetId: "asset-1", excludedFromPost: false }],
      },
      brand: null,
      brief: null,
      promptConfig: null,
      overlayLayouts: null,
      status: "draft",
    };
    const selectLimit = vi.fn().mockResolvedValue([existing]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateReturning = vi.fn().mockResolvedValue([
      { ...existing, title: "Updated" },
    ]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return { where: updateWhere };
    });

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        mediaComposition: null,
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledTimes(1);
    const [updatePayload] = updateSet.mock.calls[0];
    expect(updatePayload).not.toHaveProperty("mediaComposition");
    await expect(res.json()).resolves.toMatchObject({ title: "Updated" });
  });
});
