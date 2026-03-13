import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

vi.mock("@/services/facebook-sync", () => ({
  syncFacebookScheduledPublishJobs: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForRequest: vi.fn(),
}));

import { GET } from "@/app/api/publish-jobs/route";
import { getDb } from "@/db";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import { syncFacebookScheduledPublishJobs } from "@/services/facebook-sync";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedResolveMetaAuthForRequest = vi.mocked(resolveMetaAuthForRequest);
const mockedSyncFacebookScheduledPublishJobs = vi.mocked(syncFacebookScheduledPublishJobs);

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

  it("best-effort syncs remote Facebook schedules before listing jobs", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    mockedResolveMetaAuthForRequest.mockResolvedValue({
      source: "oauth",
      auth: {
        accessToken: "token",
        instagramUserId: "ig-id",
        pageId: "page-id",
        graphVersion: "v22.0",
      },
      account: {
        connectionId: "conn-1",
        accountKey: "page-id:ig-id",
        pageId: "page-id",
        instagramUserId: "ig-id",
      },
    } as never);
    mockedSyncFacebookScheduledPublishJobs.mockResolvedValue({
      imported: 1,
      updated: 0,
      unchanged: 0,
    });

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request(
      "https://app.example.com/api/publish-jobs?status=queued,processing&syncMeta=facebook",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockedResolveMetaAuthForRequest).toHaveBeenCalledTimes(1);
    expect(mockedSyncFacebookScheduledPublishJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        email: session.email,
        ownerHash: expect.any(String),
      }),
      expect.objectContaining({
        account: expect.objectContaining({
          pageId: "page-id",
        }),
      }),
    );
  });
});
