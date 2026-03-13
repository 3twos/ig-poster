import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  getEnvMetaAuth: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForApi: vi.fn(),
}));

vi.mock("@/services/facebook-sync", () => ({
  syncFacebookScheduledPublishJobs: vi.fn(),
}));

import { getDb } from "@/db";
import { getEnvMetaAuth } from "@/lib/meta";
import { handleFacebookPageWebhook } from "@/services/facebook-page-webhooks";
import { syncFacebookScheduledPublishJobs } from "@/services/facebook-sync";
import { resolveMetaAuthForApi } from "@/services/meta-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedGetEnvMetaAuth = vi.mocked(getEnvMetaAuth);
const mockedResolveMetaAuthForApi = vi.mocked(resolveMetaAuthForApi);
const mockedSyncFacebookScheduledPublishJobs = vi.mocked(syncFacebookScheduledPublishJobs);

describe("handleFacebookPageWebhook", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedGetEnvMetaAuth.mockReset();
    mockedResolveMetaAuthForApi.mockReset();
    mockedSyncFacebookScheduledPublishJobs.mockReset();
  });

  it("syncs matched OAuth-backed page accounts and stores webhook state", async () => {
    const account = {
      id: "meta-1",
      ownerHash: "hash",
      connectionId: "conn-1",
      authMode: "oauth" as const,
      accountKey: "page-id:ig-id",
      pageId: "page-id",
      pageName: "Example Page",
      instagramUserId: "ig-id",
      instagramUsername: "example",
      graphVersion: "v22.0",
      tokenExpiresAt: null,
      capabilities: {
        facebook: {
          available: true,
          syncMode: "remote_authoritative" as const,
        },
        instagram: {
          available: true,
          syncMode: "app_managed" as const,
        },
      },
      webhookState: {},
      createdAt: new Date("2026-03-13T18:00:00.000Z"),
      updatedAt: new Date("2026-03-13T18:00:00.000Z"),
    };

    const selectWhere = vi.fn().mockResolvedValue([account]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as ReturnType<typeof getDb>);
    mockedResolveMetaAuthForApi.mockResolvedValue({
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
    });
    mockedSyncFacebookScheduledPublishJobs.mockResolvedValue({
      imported: 1,
      updated: 2,
      published: 1,
      canceled: 0,
      unchanged: 0,
    });

    const result = await handleFacebookPageWebhook({
      object: "page",
      entry: [
        {
          id: "page-id",
          time: 1_741_892_800,
          changes: [{ field: "feed" }],
        },
      ],
    });

    expect(result).toEqual({
      ignored: false,
      receivedEntries: 1,
      pageIds: ["page-id"],
      matchedAccounts: 1,
      syncedAccounts: 1,
      failures: 0,
      unmatchedPageIds: [],
    });
    expect(mockedResolveMetaAuthForApi).toHaveBeenCalledWith({
      connectionId: "conn-1",
      ownerHash: "hash",
    });
    expect(mockedSyncFacebookScheduledPublishJobs).toHaveBeenCalledWith(
      { ownerHash: "hash" },
      expect.objectContaining({
        source: "oauth",
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookState: expect.objectContaining({
          page: expect.objectContaining({
            lastPageId: "page-id",
            lastFields: ["feed"],
            lastSyncError: null,
            lastSyncResult: expect.objectContaining({
              imported: 1,
              updated: 2,
              published: 1,
            }),
          }),
        }),
      }),
    );
  });

  it("uses env auth for env-backed page accounts and reports unmatched pages", async () => {
    const account = {
      id: "meta-1",
      ownerHash: "hash",
      connectionId: null,
      authMode: "env" as const,
      accountKey: "page-id:ig-id",
      pageId: "page-id",
      pageName: "",
      instagramUserId: "ig-id",
      instagramUsername: "",
      graphVersion: "v22.0",
      tokenExpiresAt: null,
      capabilities: null,
      webhookState: {},
      createdAt: new Date("2026-03-13T18:00:00.000Z"),
      updatedAt: new Date("2026-03-13T18:00:00.000Z"),
    };

    const selectWhere = vi.fn().mockResolvedValue([account]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as ReturnType<typeof getDb>);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "env-token",
      instagramUserId: "ig-id",
      pageId: "page-id",
      graphVersion: "v22.0",
    });
    mockedSyncFacebookScheduledPublishJobs.mockResolvedValue({
      imported: 0,
      updated: 0,
      published: 0,
      canceled: 1,
      unchanged: 2,
    });

    const result = await handleFacebookPageWebhook({
      object: "page",
      entry: [
        {
          id: "page-id",
          changes: [{ field: "feed" }],
        },
        {
          id: "other-page",
          changes: [{ field: "feed" }],
        },
      ],
    });

    expect(result).toEqual({
      ignored: false,
      receivedEntries: 2,
      pageIds: ["page-id", "other-page"],
      matchedAccounts: 1,
      syncedAccounts: 1,
      failures: 0,
      unmatchedPageIds: ["other-page"],
    });
    expect(mockedResolveMetaAuthForApi).not.toHaveBeenCalled();
    expect(mockedSyncFacebookScheduledPublishJobs).toHaveBeenCalledWith(
      { ownerHash: "hash" },
      expect.objectContaining({
        source: "env",
      }),
    );
  });

  it("ignores non-page webhook payloads", async () => {
    const result = await handleFacebookPageWebhook({
      object: "instagram",
      entry: [{ id: "page-id" }],
    });

    expect(result).toEqual({
      ignored: true,
      receivedEntries: 0,
      pageIds: [],
      matchedAccounts: 0,
      syncedAccounts: 0,
      failures: 0,
      unmatchedPageIds: [],
    });
    expect(mockedGetDb).not.toHaveBeenCalled();
  });
});
