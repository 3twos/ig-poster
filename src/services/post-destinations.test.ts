import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/db";
import {
  buildDefaultPostDestinationSeeds,
  clonePostDestinations,
  createDefaultPostDestinations,
  deletePostDestinations,
  getStoredPostDestinations,
  isMissingPostDestinationsSchemaError,
  listStoredPostDestinationsByPostId,
  syncPublishedInstagramDestination,
  syncPostDestinationsFromPublishSettings,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";

const mockedGetDb = vi.mocked(getDb);

describe("post-destinations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetDb.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  const missingSchemaError = Object.assign(
    new Error('relation "post_destinations" does not exist'),
    { code: "42P01" },
  );

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

  it("detects post-destination schema drift errors", () => {
    expect(isMissingPostDestinationsSchemaError(missingSchemaError)).toBe(true);
    expect(
      isMissingPostDestinationsSchemaError(
        Object.assign(new Error("permission denied"), { code: "42501" }),
      ),
    ).toBe(false);
  });

  it("skips destination seed writes when the schema is missing", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn().mockRejectedValue(missingSchemaError),
      })),
    };

    await expect(
      createDefaultPostDestinations(db as never, {
        id: "post_1",
        publishSettings: {
          caption: "Caption",
          firstComment: "Comment",
          locationId: "123",
          reelShareToFeed: true,
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("skips destination deletes when the schema is missing", async () => {
    const db = {
      delete: vi.fn(() => ({
        where: vi.fn().mockRejectedValue(missingSchemaError),
      })),
    };

    await expect(deletePostDestinations(db as never, "post_1")).resolves.toBeUndefined();
  });

  it("syncs published Instagram remote state", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    const db = {
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
        await callback({
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([
                {
                  id: "dest_1",
                  postId: "post_1",
                  destination: "instagram",
                  enabled: true,
                  syncMode: "app_managed",
                  desiredState: "draft",
                  remoteState: "draft",
                  caption: "Old caption",
                  firstComment: "Old comment",
                  locationId: "123",
                  userTags: [{ username: "old", x: 0.2, y: 0.3 }],
                  publishAt: null,
                  remoteObjectId: null,
                  remoteContainerId: null,
                  remotePermalink: null,
                  remoteStatePayload: {},
                  lastSyncedAt: null,
                  lastError: null,
                },
              ]),
            })),
          })),
          update: vi.fn(() => ({ set: updateSet })),
          insert: vi.fn(),
        });
      }),
    };

    await syncPublishedInstagramDestination(db as never, {
      postId: "post_1",
      caption: "Caption",
      firstComment: "First comment",
      locationId: "place_1",
      userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
      remoteObjectId: "ig_media_1",
      remoteContainerId: "container_1",
      remotePermalink: "https://instagram.com/p/ig_media_1",
      publishedAt: "2026-03-13T16:00:00.000Z",
    });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        desiredState: "published",
        remoteState: "published",
        caption: "Caption",
        firstComment: "First comment",
        locationId: "place_1",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
        publishAt: new Date("2026-03-13T16:00:00.000Z"),
        remoteObjectId: "ig_media_1",
        remoteContainerId: "container_1",
        remotePermalink: "https://instagram.com/p/ig_media_1",
        lastSyncedAt: expect.any(Date),
      }),
    );
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

  it("no-ops legacy publish-settings sync when the destination schema is missing", async () => {
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(missingSchemaError),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(),
    };

    await expect(
      syncPostDestinationsFromPublishSettings(db as never, {
        id: "post_1",
        publishSettings: {
          caption: "Updated caption",
          firstComment: "Updated first comment",
          locationId: "456",
          reelShareToFeed: true,
        },
      }),
    ).resolves.toBeUndefined();
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
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: selectWhere })),
      })),
      update: vi.fn(() => ({ set: updateSet })),
      insert: vi.fn(),
    };
    const transaction = vi.fn(
      async (
        callback: (db: typeof tx) => Promise<void>,
        config?: { isolationLevel?: string },
      ) => {
        expect(config).toEqual(
          expect.objectContaining({ isolationLevel: "serializable" }),
        );
        await callback(tx);
      },
    );
    const db = {
      transaction,
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
    expect(transaction).toHaveBeenCalledTimes(1);
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

  it("returns no stored destinations when the destination schema is missing", async () => {
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(missingSchemaError),
        })),
      })),
    } as never);

    await expect(getStoredPostDestinations("post_1")).resolves.toEqual([]);
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

  it("returns empty destination groups when the destination schema is missing", async () => {
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(missingSchemaError),
        })),
      })),
    } as never);

    const grouped = await listStoredPostDestinationsByPostId([
      "post_1",
      "post_2",
    ]);

    expect(grouped.get("post_1")).toEqual([]);
    expect(grouped.get("post_2")).toEqual([]);
  });
});
