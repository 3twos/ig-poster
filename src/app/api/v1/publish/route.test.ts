import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForApi: vi.fn(),
  MetaAuthServiceError: class MetaAuthServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/services/post-destinations", () => ({
  syncPublishedInstagramDestination: vi.fn(),
  upsertPostDestinationRemoteState: vi.fn(),
}));

vi.mock("@/lib/meta-media-preflight", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/meta-media-preflight")
  >("@/lib/meta-media-preflight");
  return {
    ...actual,
    preflightMetaMediaForPublish: vi.fn(),
  };
});

vi.mock("@/lib/publish-jobs", () => ({
  completePublishJobFailure: vi.fn(),
  completePublishJobSuccess: vi.fn(),
  createPublishJob: vi.fn(),
  failQueuedPublishJob: vi.fn(),
  markPostPublished: vi.fn(),
  markPostScheduled: vi.fn(),
  reserveImmediatePublishJob: vi.fn(),
  syncQueuedPublishJobRemoteState: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("@/lib/meta", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta")>(
    "@/lib/meta",
  );
  return {
    ...actual,
    publishFacebookPageContent: vi.fn(),
    publishInstagramContent: vi.fn(),
    publishInstagramFirstComment: vi.fn(),
  };
});

import { POST } from "@/app/api/v1/publish/route";
import { getDb } from "@/db";
import { isBlobEnabled } from "@/lib/blob-store";
import { publishFacebookPageContent, publishInstagramContent } from "@/lib/meta";
import { preflightMetaMediaForPublish } from "@/lib/meta-media-preflight";
import {
  createPublishJob,
  completePublishJobSuccess,
  failQueuedPublishJob,
  markPostScheduled,
  reserveImmediatePublishJob,
  syncQueuedPublishJobRemoteState,
} from "@/lib/publish-jobs";
import { resolveActorFromRequest } from "@/services/actors";
import { resolveMetaAuthForApi } from "@/services/meta-auth";
import {
  syncPublishedInstagramDestination,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedResolveMetaAuthForApi = vi.mocked(resolveMetaAuthForApi);
const mockedPreflightMetaMedia = vi.mocked(preflightMetaMediaForPublish);
const mockedCreatePublishJob = vi.mocked(createPublishJob);
const mockedFailQueuedPublishJob = vi.mocked(failQueuedPublishJob);
const mockedMarkPostScheduled = vi.mocked(markPostScheduled);
const mockedReserveImmediatePublishJob = vi.mocked(reserveImmediatePublishJob);
const mockedSyncQueuedPublishJobRemoteState = vi.mocked(syncQueuedPublishJobRemoteState);
const mockedPublishFacebookPageContent = vi.mocked(publishFacebookPageContent);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedCompletePublishJobSuccess = vi.mocked(completePublishJobSuccess);
const mockedIsBlobEnabled = vi.mocked(isBlobEnabled);
const mockedGetDb = vi.mocked(getDb);
const mockedUpsertPostDestinationRemoteState = vi.mocked(
  upsertPostDestinationRemoteState,
);
const mockedSyncPublishedInstagramDestination = vi.mocked(
  syncPublishedInstagramDestination,
);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
} as never;

describe("POST /api/v1/publish", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
    mockedResolveMetaAuthForApi.mockResolvedValue({
      source: "oauth",
      auth: {
        accessToken: "token",
        instagramUserId: "ig-id",
        pageId: "page_1",
        graphVersion: "v22.0",
      },
      account: {
        connectionId: "conn_1",
        accountKey: "page_1:ig-id",
        pageId: "page_1",
        instagramUserId: "ig-id",
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
    mockedPreflightMetaMedia.mockResolvedValue(undefined);
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);
    mockedCreatePublishJob.mockResolvedValue({
      id: "job_1",
      publishAt: new Date("2026-03-10T18:30:00.000Z"),
    } as never);
    mockedReserveImmediatePublishJob.mockResolvedValue({
      id: "job_1",
      ownerHash: "owner_hash",
      postId: null,
      destination: "instagram",
      remoteAuthority: "app_managed",
      accountKey: "page_1:ig-id",
      pageId: "page_1",
      instagramUserId: "ig-id",
      status: "processing",
      caption: "Now",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
      publishAt: new Date("2026-03-09T23:00:00.000Z"),
      attempts: 1,
      maxAttempts: 1,
      lastAttemptAt: new Date("2026-03-09T23:00:00.000Z"),
      lastError: null,
      authSource: "oauth",
      connectionId: "conn_1",
      outcomeContext: null,
      publishId: null,
      creationId: null,
      children: null,
      completedAt: null,
      canceledAt: null,
      events: [],
      createdAt: new Date("2026-03-09T23:00:00.000Z"),
      updatedAt: new Date("2026-03-09T23:00:00.000Z"),
    } as never);
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      publishId: "publish_1",
      creationId: "creation_1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue({} as never);
    mockedIsBlobEnabled.mockReturnValue(false);
    mockedFailQueuedPublishJob.mockResolvedValue({} as never);
    mockedMarkPostScheduled.mockResolvedValue(undefined);
    mockedSyncQueuedPublishJobRemoteState.mockResolvedValue({
      id: "job_1",
      publishAt: new Date("2026-03-10T18:30:00.000Z"),
    } as never);
    mockedUpsertPostDestinationRemoteState.mockResolvedValue(undefined);
    mockedSyncPublishedInstagramDestination.mockResolvedValue(undefined);
  });

  it("requires an authenticated actor", async () => {
    mockedResolveActorFromRequest.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("supports dry-run validation without publishing", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          dryRun: true,
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "validated",
          destination: "instagram",
          mode: "image",
          authSource: "oauth",
          scheduled: false,
        },
      },
    });
    expect(mockedPreflightMetaMedia).toHaveBeenCalledTimes(1);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("schedules future publish requests instead of publishing immediately", async () => {
    const publishAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockedCreatePublishJob.mockResolvedValueOnce({
      id: "job_1",
      publishAt: new Date(publishAt),
    } as never);

    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          publishAt,
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "scheduled",
          destination: "instagram",
          mode: "image",
          id: "job_1",
          publishAt,
        },
      },
    });
    expect(mockedCreatePublishJob).toHaveBeenCalledTimes(1);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("publishes immediately for valid direct media payloads", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          caption: "Caption",
          firstComment: "First comment",
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "published",
          destination: "instagram",
          mode: "image",
          publishId: "publish_1",
          creationId: "creation_1",
        },
      },
    });
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      {
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Caption",
        locationId: undefined,
        userTags: undefined,
      },
      expect.anything(),
    );
  });

  it("publishes Facebook images when requested", async () => {
    mockedReserveImmediatePublishJob.mockResolvedValueOnce({
      id: "job_1",
      ownerHash: "owner_hash",
      postId: null,
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      accountKey: "page_1:ig-id",
      pageId: "page_1",
      instagramUserId: "ig-id",
      status: "processing",
      caption: "Caption",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
      publishAt: new Date("2026-03-09T23:00:00.000Z"),
      attempts: 1,
      maxAttempts: 1,
      lastAttemptAt: new Date("2026-03-09T23:00:00.000Z"),
      lastError: null,
      authSource: "oauth",
      connectionId: "conn_1",
      outcomeContext: null,
      publishId: null,
      creationId: null,
      children: null,
      completedAt: null,
      canceledAt: null,
      events: [],
      createdAt: new Date("2026-03-09T23:00:00.000Z"),
      updatedAt: new Date("2026-03-09T23:00:00.000Z"),
    } as never);
    mockedPublishFacebookPageContent.mockResolvedValue({
      mode: "image",
      publishId: "page_1_1",
      creationId: "photo_1",
    });

    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          destination: "facebook",
          caption: "Caption",
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "published",
          destination: "facebook",
          mode: "image",
          publishId: "page_1_1",
          creationId: "photo_1",
        },
      },
    });
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
      }),
    );
    expect(mockedPublishFacebookPageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Caption",
      }),
      expect.anything(),
    );
  });

  it("creates remote-authoritative Facebook scheduled posts and shadows them locally", async () => {
    const publishAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "post_1" }]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);
    mockedPublishFacebookPageContent.mockResolvedValue({
      mode: "image",
      publishId: "page_1_1",
      creationId: "photo_1",
    });
    mockedCreatePublishJob.mockResolvedValueOnce({
      id: "job_fb_1",
      publishAt: new Date(publishAt),
    } as never);
    mockedSyncQueuedPublishJobRemoteState.mockResolvedValueOnce({
      id: "job_fb_1",
      publishAt: new Date(publishAt),
    } as never);

    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          postId: "post_1",
          destination: "facebook",
          caption: "Facebook scheduled",
          publishAt,
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        publish: {
          status: "scheduled",
          destination: "facebook",
          mode: "image",
          id: "job_fb_1",
          publishId: "page_1_1",
          creationId: "photo_1",
          publishAt,
        },
      },
    });
    expect(mockedPublishFacebookPageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Facebook scheduled",
        publishAt,
      }),
      expect.anything(),
    );
    expect(mockedCreatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
        markPostScheduled: false,
      }),
    );
    expect(mockedSyncQueuedPublishJobRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_fb_1" }),
      expect.objectContaining({
        publishId: "page_1_1",
        creationId: "photo_1",
      }),
    );
    expect(mockedMarkPostScheduled).toHaveBeenCalledWith(
      expect.anything(),
      "owner_hash",
      "post_1",
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        destination: "facebook",
        desiredState: "scheduled",
        remoteState: "scheduled",
      }),
    );
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
  });

  it("records a failed local shadow job when remote Facebook scheduling fails", async () => {
    const publishAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "post_1" }]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);
    mockedCreatePublishJob.mockResolvedValueOnce({
      id: "job_fb_1",
      publishAt: new Date(publishAt),
    } as never);
    mockedPublishFacebookPageContent.mockRejectedValueOnce(
      new Error("Meta schedule failed"),
    );

    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          postId: "post_1",
          destination: "facebook",
          caption: "Facebook scheduled",
          publishAt,
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(mockedCreatePublishJob.mock.invocationCallOrder[0]).toBeLessThan(
      mockedPublishFacebookPageContent.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(mockedFailQueuedPublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_fb_1" }),
      "Meta schedule failed",
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        destination: "facebook",
        remoteState: "failed",
        lastError: "Meta schedule failed",
      }),
    );
  });

  it("rejects Instagram-only metadata on Facebook publishes", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/v1/publish", {
        method: "POST",
        body: JSON.stringify({
          destination: "facebook",
          caption: "Caption",
          firstComment: "First comment",
          media: {
            mode: "image",
            imageUrl: "https://cdn.example.com/image.jpg",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishFacebookPageContent).not.toHaveBeenCalled();
  });
});
