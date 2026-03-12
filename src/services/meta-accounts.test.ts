import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/db";
import { metaAccounts } from "@/db/schema";
import { upsertMetaAccountSnapshot } from "@/services/meta-accounts";

const mockedGetDb = vi.mocked(getDb);

describe("upsertMetaAccountSnapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("upserts by owner/account key and returns the stored snapshot", async () => {
    const returning = vi.fn().mockResolvedValue([
      {
        id: "acct_1",
        ownerHash: "owner_hash",
        accountKey: "page_1:ig_1",
      },
    ]);
    const onConflictDoUpdate = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));

    mockedGetDb.mockReturnValue({
      insert: vi.fn(() => ({ values })),
    } as unknown as ReturnType<typeof getDb>);

    const result = await upsertMetaAccountSnapshot("owner_hash", {
      source: "oauth",
      auth: {
        accessToken: "secret",
        instagramUserId: "ig_1",
        pageId: "page_1",
        graphVersion: "v22.0",
      },
      account: {
        connectionId: "conn_1",
        accountKey: "page_1:ig_1",
        pageId: "page_1",
        pageName: "Page One",
        instagramUserId: "ig_1",
        instagramUsername: "brand",
        tokenExpiresAt: "2026-04-12T00:00:00.000Z",
        capabilities: {
          facebook: {
            destination: "facebook",
            publishEnabled: true,
            syncMode: "remote_authoritative",
            sourceOfTruth: "meta",
          },
          instagram: {
            destination: "instagram",
            publishEnabled: true,
            syncMode: "app_managed",
            sourceOfTruth: "app",
          },
        },
      },
    });

    expect(result).toMatchObject({
      id: "acct_1",
      ownerHash: "owner_hash",
      accountKey: "page_1:ig_1",
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [metaAccounts.ownerHash, metaAccounts.accountKey],
        set: expect.objectContaining({
          ownerHash: "owner_hash",
          accountKey: "page_1:ig_1",
          authMode: "oauth",
        }),
      }),
    );
  });

  it("returns null when no account key can be derived", async () => {
    const result = await upsertMetaAccountSnapshot("owner_hash", {
      source: "env",
      auth: {
        accessToken: "secret",
        instagramUserId: "ig_1",
        graphVersion: "v22.0",
      },
      account: {
        instagramUserId: "ig_1",
        accountKey: "   ",
      },
    });

    expect(result).toBeNull();
    expect(mockedGetDb).not.toHaveBeenCalled();
  });
});
