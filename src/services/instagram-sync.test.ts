import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  getInstagramMediaPublishState: vi.fn(),
}));

vi.mock("@/lib/publish-jobs", () => ({
  markPostPublished: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  syncPublishedInstagramDestination: vi.fn(),
  upsertPostDestinationRemoteState: vi.fn(),
}));

import { getDb } from "@/db";
import { getInstagramMediaPublishState } from "@/lib/meta";
import { markPostPublished } from "@/lib/publish-jobs";
import {
  syncInstagramPublishedPost,
} from "@/services/instagram-sync";
import {
  syncPublishedInstagramDestination,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";

const mockedGetDb = vi.mocked(getDb);
const mockedGetInstagramMediaPublishState = vi.mocked(getInstagramMediaPublishState);
const mockedMarkPostPublished = vi.mocked(markPostPublished);
const mockedSyncPublishedInstagramDestination = vi.mocked(syncPublishedInstagramDestination);
const mockedUpsertPostDestinationRemoteState = vi.mocked(upsertPostDestinationRemoteState);

const actor = { ownerHash: "owner_hash" } as const;
const resolvedAuth = {
  source: "oauth",
  auth: {
    accessToken: "token",
    instagramUserId: "ig-id",
    graphVersion: "v22.0",
  },
  account: {
    accountKey: "ig-id",
    instagramUserId: "ig-id",
  },
} as const;

const postedRow = {
  id: "post_1",
  status: "posted" as const,
  publishSettings: {
    caption: "Caption",
    firstComment: "First comment",
    locationId: "place_1",
    reelShareToFeed: true,
  },
  publishHistory: [
    {
      publishedAt: "2026-03-13T15:55:00.000Z",
      igMediaId: "ig_media_1",
    },
  ],
  publishedAt: new Date("2026-03-13T15:55:00.000Z"),
};

const instagramDestination = {
  destination: "instagram" as const,
  enabled: true,
  syncMode: "app_managed" as const,
  desiredState: "published" as const,
  remoteState: "published" as const,
  caption: "Caption",
  firstComment: "First comment",
  locationId: "place_1",
  userTags: [{ username: "handle", x: 0.5, y: 0.5 }],
  publishAt: new Date("2026-03-13T15:55:00.000Z"),
  remoteObjectId: "ig_media_1",
  remoteContainerId: "container_1",
  remotePermalink: null,
  remoteStatePayload: {},
  lastSyncedAt: null,
  lastError: null,
};

describe("syncInstagramPublishedPost", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);
  });

  it("syncs stale published Instagram destination state", async () => {
    mockedGetInstagramMediaPublishState.mockResolvedValue({
      remoteObjectId: "ig_media_1",
      remotePermalink: "https://instagram.com/p/ig_media_1",
      publishedAt: "2026-03-13T16:00:00.000Z",
    });

    const result = await syncInstagramPublishedPost(
      actor,
      resolvedAuth as never,
      postedRow,
      [instagramDestination],
    );

    expect(result).toEqual({
      attempted: true,
      synced: true,
    });
    expect(mockedGetInstagramMediaPublishState).toHaveBeenCalledWith(
      "ig_media_1",
      resolvedAuth.auth,
    );
    expect(mockedMarkPostPublished).toHaveBeenCalledWith(
      expect.anything(),
      "owner_hash",
      "post_1",
      "ig_media_1",
      "instagram",
      {
        remotePermalink: "https://instagram.com/p/ig_media_1",
        publishedAt: "2026-03-13T16:00:00.000Z",
      },
    );
    expect(mockedSyncPublishedInstagramDestination).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        remoteObjectId: "ig_media_1",
        remoteContainerId: "container_1",
        remotePermalink: "https://instagram.com/p/ig_media_1",
        publishedAt: "2026-03-13T16:00:00.000Z",
      }),
    );
  });

  it("skips fresh published Instagram destination state", async () => {
    const result = await syncInstagramPublishedPost(
      actor,
      resolvedAuth as never,
      postedRow,
      [
        {
          ...instagramDestination,
          remotePermalink: "https://instagram.com/p/ig_media_1",
          lastSyncedAt: new Date(),
        },
      ],
    );

    expect(result).toEqual({
      attempted: false,
      synced: false,
      skippedReason: "fresh",
    });
    expect(mockedGetInstagramMediaPublishState).not.toHaveBeenCalled();
  });

  it("marks the Instagram destination out of sync when Meta lookup fails", async () => {
    mockedGetInstagramMediaPublishState.mockRejectedValue(
      new Error("Unsupported get request"),
    );

    const result = await syncInstagramPublishedPost(
      actor,
      resolvedAuth as never,
      postedRow,
      [instagramDestination],
    );

    expect(result).toMatchObject({
      attempted: true,
      synced: false,
      error: "Unsupported get request",
    });
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        destination: "instagram",
        desiredState: "published",
        remoteState: "out_of_sync",
        remoteObjectId: "ig_media_1",
        lastError: "Unsupported get request",
      }),
    );
  });
});
