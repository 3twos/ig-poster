import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { PATCH } from "@/app/api/publish-jobs/[id]/route";
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

describe("PATCH /api/publish-jobs/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when publish job is not found", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(404);
  });
});
