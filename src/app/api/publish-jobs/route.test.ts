import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { GET } from "@/app/api/publish-jobs/route";
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

describe("GET /api/publish-jobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/publish-jobs");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid status query values", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs?status=invalid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
