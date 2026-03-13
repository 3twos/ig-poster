import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/db";
import {
  buildDefaultPostDestinationSeeds,
  clonePostDestinations,
  deletePostDestinations,
  getStoredPostDestinations,
  listStoredPostDestinationsByPostId,
  syncPostDestinationsFromPublishSettings,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";

const mockedGetDb = vi.mocked(getDb);

describe("post-destinations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetDb.mockReset();
  });

  it("builds both destination rows for new posts", () => {
    const seeds = buildDefaultPostDestinationSeeds({
      id: "post_1",
      publishSettings: {
        caption: "Caption",
        firstComment: "First comment",
        locationId: "123",
        reelShareToFeed: true,
      },
    });

    expect(seeds).toHaveLength(2);
    expect(seeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          postId: "post_1",
          destination: "facebook",
          enabled: false,
          syncMode: "remote_authoritative",
          caption: "Caption",
          firstComment: null,
          locationId: null,
        }),
        expect.objectContaining({
          postId: "post_1",
          destination: "instagram",
          enabled: true,
          syncMode: "app_managed",
          caption: "Caption",
          firstComment: "First comment",
          locationId: "123",
        }),
      ]),
    );
  });

  it("preserves explicitly empty publish metadata values", () => {
    const seeds = buildDefaultPostDestinationSeeds({
      id: "post_1",
      publishSettings: {
        caption: "",
        firstComment: "",
        locationId: "",
        reelShareToFeed: true,
      },
    });

    expect(seeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: "facebook",
          caption: "",
        }),
        expect.objectContaining({
          destination: "instagram",
          caption: "",
          firstComment: "",
          locationId: "",
        }),
      ]),
    );
  });

  it("clones saved destination configuration and resets remote publish state", async () => {
    const existingDestinations = [
      {
        id: "dest_1",
        postId: "post_1",
        destination: "instagram" as const,
        enabled: true,
        syncMode: "app_managed" as const,
        desiredState: "published" as const,
        remoteState: "published" as const,
        caption: "IG caption",
        firstComment: "Comment",
        locationId: "123",
        userTags: [{ username: "handle", x: 0.2, y: 0.7 }],
        publishAt: new Date("2026-03-12T20:00:00.000Z"),
        remoteObjectId: "ig-object",
        remoteContainerId: "container_1",
        remotePermalink: "https://instagram.com/p/example",
        remoteStatePayload: { remote: true },
        lastSyncedAt: new Date("2026-03-12T20:05:00.000Z"),
        lastError: "Old error",
      },
    ];
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(existingDestinations),
        })),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    await clonePostDestinations(
      db as never,
      {
        id: "post_1",
        publishSettings: {
          caption: "Shared caption",
          firstComment: "Shared comment",
          locationId: "123",
          reelShareToFeed: true,
        },
      },
      {
        id: "copy_1",
        publishSettings: {
          caption: "Duplicated caption",
          firstComment: "Duplicated comment",
          locationId: "456",
          reelShareToFeed: true,
        },
      },
    );

    expect(insertValues).toHaveBeenCalledTimes(1);
    const [seeds] = insertValues.mock.calls[0];
    expect(seeds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          postId: "copy_1",
          destination: "instagram",
          enabled: true,
          caption: "IG caption",
          firstComment: "Comment",
          locationId: "123",
          desiredState: "draft",
          remoteState: "draft",
          publishAt: null,
          remoteObjectId: null,
          remoteContainerId: null,
          remotePermalink: null,
          lastSyncedAt: null,
          lastError: null,
        }),
        expect.objectContaining({
          postId: "copy_1",
          destination: "facebook",
          enabled: false,
          caption: "Duplicated caption",
          firstComment: null,
          locationId: null,
          desiredState: "draft",
          remoteState: "draft",
        }),
      ]),
    );
  });

  it("deletes all destination rows for a post", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const db = {
      delete: vi.fn(() => ({ where })),
    };

    await deletePostDestinations(db as never, "post_1");

    expect(where).toHaveBeenCalledTimes(1);
  });

  it("syncs legacy publish settings into stored destination rows", async () => {
    const rows = [
      { postId: "post_1", destination: "facebook" as const },
      { postId: "post_1", destination: "instagram" as const },
    ];
    const selectWhere = vi.fn().mockResolvedValue(rows);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: selectWhere })),
      })),
      insert: vi.fn(),
      update: vi.fn(() => ({ set: updateSet })),
    };

    await syncPostDestinationsFromPublishSettings(db as never, {
      id: "post_1",
      publishSettings: {
        caption: "Updated caption",
        firstComment: "Updated first comment",
        locationId: "456",
        reelShareToFeed: true,
      },
    });

    expect(updateSet).toHaveBeenCalledTimes(2);
    expect(updateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        caption: "Updated caption",
        firstComment: null,
        locationId: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(updateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        caption: "Updated caption",
        firstComment: "Updated first comment",
        locationId: "456",
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("clears stale non-instagram metadata while syncing publish settings", async () => {
    const rows = [
      { postId: "post_1", destination: "facebook" as const },
      { postId: "post_1", destination: "instagram" as const },
    ];
    const selectWhere = vi.fn().mockResolvedValue(rows);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: selectWhere })),
      })),
      insert: vi.fn(),
      update: vi.fn(() => ({ set: updateSet })),
    };

    await syncPostDestinationsFromPublishSettings(db as never, {
      id: "post_1",
      publishSettings: {
        caption: "Caption",
        firstComment: "Should not stick",
        locationId: "999",
        reelShareToFeed: true,
      },
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: "Caption",
        firstComment: null,
        locationId: null,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("backfills missing destination rows while syncing publish settings", async () => {
    const rows = [{ postId: "post_1", destination: "instagram" as const }];
    const selectWhere = vi.fn().mockResolvedValue(rows);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: selectWhere })),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
    };

    await syncPostDestinationsFromPublishSettings(db as never, {
      id: "post_1",
      publishSettings: {
        caption: "Caption",
        firstComment: "",
        locationId: "",
        reelShareToFeed: true,
      },
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          postId: "post_1",
          destination: "facebook",
          caption: "Caption",
          enabled: false,
        }),
      ]),
    );
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: "Caption",
        firstComment: "",
        locationId: "",
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("updates stored remote Facebook schedule state", async () => {
    const scheduledAt = new Date("2026-03-13T18:00:00.000Z");
    const syncedAt = new Date("2026-03-13T17:45:00.000Z");
    const existing = [
      {
        id: "dest_1",
        postId: "post_1",
        destination: "facebook" as const,
        enabled: false,
        syncMode: "remote_authoritative" as const,
        desiredState: "draft" as const,
        remoteState: "draft" as const,
        caption: "Old caption",
        firstComment: null,
        locationId: null,
        userTags: null,
        publishAt: null,
        remoteObjectId: null,
        remoteContainerId: null,
        remotePermalink: null,
        remoteStatePayload: {},
        lastSyncedAt: null,
        lastError: "old",
        createdAt: new Date("2026-03-13T17:00:00.000Z"),
        updatedAt: new Date("2026-03-13T17:00:00.000Z"),
      },
    ];
    const selectWhere = vi.fn().mockResolvedValue(existing);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: selectWhere })),
      })),
      insert: vi.fn(),
      update: vi.fn(() => ({ set: updateSet })),
    };

    await upsertPostDestinationRemoteState(db as never, {
      postId: "post_1",
      destination: "facebook",
      enabled: true,
      syncMode: "remote_authoritative",
      desiredState: "scheduled",
      remoteState: "scheduled",
      caption: "Queued on Facebook",
      publishAt: scheduledAt,
      remoteObjectId: "page_1_1",
      remoteContainerId: "photo_1",
      remoteStatePayload: {
        scheduledPublishTime: scheduledAt.toISOString(),
      },
      lastSyncedAt: syncedAt,
      lastError: null,
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        syncMode: "remote_authoritative",
        desiredState: "scheduled",
        remoteState: "scheduled",
        caption: "Queued on Facebook",
        publishAt: scheduledAt,
        remoteObjectId: "page_1_1",
        remoteContainerId: "photo_1",
        lastSyncedAt: syncedAt,
        lastError: null,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("loads stored destination rows for a single post", async () => {
    const rows = [{ postId: "post_1", destination: "instagram" }];
    const where = vi.fn().mockResolvedValue(rows);

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where })),
      })),
    } as never);

    await expect(getStoredPostDestinations("post_1")).resolves.toEqual(rows);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it("groups stored destination rows by post id", async () => {
    const rows = [
      { postId: "post_1", destination: "instagram" },
      { postId: "post_1", destination: "facebook" },
      { postId: "post_2", destination: "instagram" },
    ];
    const where = vi.fn().mockResolvedValue(rows);

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where })),
      })),
    } as never);

    const grouped = await listStoredPostDestinationsByPostId([
      "post_1",
      "post_2",
      "post_1",
    ]);

    expect(grouped.get("post_1")).toEqual(rows.slice(0, 2));
    expect(grouped.get("post_2")).toEqual(rows.slice(2));
  });
});
