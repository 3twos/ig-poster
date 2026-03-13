import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForRequest: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
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
  const actual = await vi.importActual<typeof import("@/lib/meta")>("@/lib/meta");
  return {
    ...actual,
    publishFacebookPageContent: vi.fn(),
    publishInstagramContent: vi.fn(),
    publishInstagramFirstComment: vi.fn(),
  };
});

import { POST } from "@/app/api/meta/schedule/route";
import { getDb } from "@/db";
import {
  MetaMediaPreflightError,
  preflightMetaMediaForPublish,
} from "@/lib/meta-media-preflight";
import {
  publishFacebookPageContent,
  publishInstagramContent,
  publishInstagramFirstComment,
} from "@/lib/meta";
import {
  completePublishJobFailure,
  completePublishJobSuccess,
  createPublishJob,
  failQueuedPublishJob,
  markPostPublished,
  markPostScheduled,
  reserveImmediatePublishJob,
  syncQueuedPublishJobRemoteState,
} from "@/lib/publish-jobs";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";

const mockedGetDb = vi.mocked(getDb);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedResolveMetaAuth = vi.mocked(resolveMetaAuthForRequest);
const mockedPreflightMetaMedia = vi.mocked(preflightMetaMediaForPublish);
const mockedCreatePublishJob = vi.mocked(createPublishJob);
const mockedFailQueuedPublishJob = vi.mocked(failQueuedPublishJob);
const mockedReserveImmediatePublishJob = vi.mocked(reserveImmediatePublishJob);
const mockedSyncQueuedPublishJobRemoteState = vi.mocked(syncQueuedPublishJobRemoteState);
const mockedPublishFacebookPageContent = vi.mocked(publishFacebookPageContent);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedPublishInstagramFirstComment = vi.mocked(publishInstagramFirstComment);
const mockedCompletePublishJobSuccess = vi.mocked(completePublishJobSuccess);
const mockedCompletePublishJobFailure = vi.mocked(completePublishJobFailure);
const mockedMarkPostPublished = vi.mocked(markPostPublished);
const mockedMarkPostScheduled = vi.mocked(markPostScheduled);
const mockedUpsertPostDestinationRemoteState = vi.mocked(
  upsertPostDestinationRemoteState,
);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const reservedJob = {
  id: "job_1",
  ownerHash: "owner_hash",
  postId: "post_1",
  destination: "instagram" as const,
  remoteAuthority: "app_managed" as const,
  accountKey: "page_1:ig-id",
  pageId: "page_1",
  instagramUserId: "ig-id",
  status: "processing",
  caption: "Now",
  firstComment: null,
  locationId: null,
  userTags: null,
  media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
  publishAt: new Date("2026-03-07T16:00:00.000Z"),
  attempts: 1,
  maxAttempts: 1,
  lastAttemptAt: new Date("2026-03-07T16:00:00.000Z"),
  lastError: null,
  authSource: "oauth",
  connectionId: "conn_1",
  outcomeContext: null,
  publishId: null,
  creationId: null,
  children: null,
  completedAt: new Date("2026-03-07T16:00:00.000Z"),
  canceledAt: null,
  events: [],
  createdAt: new Date("2026-03-07T16:00:00.000Z"),
  updatedAt: new Date("2026-03-07T16:00:00.000Z"),
};

describe("POST /api/meta/schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedReadWorkspace.mockResolvedValue(session);
    mockedResolveMetaAuth.mockResolvedValue({
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
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);
    mockedPreflightMetaMedia.mockResolvedValue(undefined);
    mockedReserveImmediatePublishJob.mockResolvedValue(
      reservedJob as Awaited<ReturnType<typeof reserveImmediatePublishJob>>,
    );
    mockedPublishInstagramFirstComment.mockResolvedValue("comment_1");
    mockedCompletePublishJobSuccess.mockResolvedValue(
      { ...reservedJob, status: "published" } as Awaited<
        ReturnType<typeof completePublishJobSuccess>
      >,
    );
    mockedCompletePublishJobFailure.mockResolvedValue(
      { ...reservedJob, status: "failed" } as Awaited<
        ReturnType<typeof completePublishJobFailure>
      >,
    );
    mockedFailQueuedPublishJob.mockResolvedValue(
      { ...reservedJob, status: "failed" } as Awaited<
        ReturnType<typeof failQueuedPublishJob>
      >,
    );
    mockedSyncQueuedPublishJobRemoteState.mockResolvedValue(
      {
        ...reservedJob,
        id: "job_fb_1",
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
        publishAt: new Date("2026-03-10T18:30:00.000Z"),
      } as Awaited<ReturnType<typeof syncQueuedPublishJobRemoteState>>,
    );
    mockedMarkPostScheduled.mockResolvedValue(undefined);
    mockedUpsertPostDestinationRemoteState.mockResolvedValue(undefined);
  });

  it("returns 401 when workspace auth is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Hello",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for blank postId", async () => {
    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postId: "   ",
        caption: "Scheduled caption",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedGetDb).not.toHaveBeenCalled();
  });

  it("returns 400 when carousel metadata uses a post-level user-tag list", async () => {
    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Invalid",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
        media: {
          mode: "carousel",
          items: [
            { mediaType: "image", url: "https://cdn.example.com/c1.jpg" },
            { mediaType: "image", url: "https://cdn.example.com/c2.jpg" },
          ],
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedPreflightMetaMedia).not.toHaveBeenCalled();
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("returns 400 when Facebook publish payload includes Instagram-only metadata", async () => {
    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destination: "facebook",
        caption: "Invalid",
        firstComment: "First comment",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishFacebookPageContent).not.toHaveBeenCalled();
  });

  it("returns 400 when publishing to both with carousel media", async () => {
    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "both",
        caption: "Invalid",
        media: {
          mode: "carousel",
          items: [
            { mediaType: "image", url: "https://cdn.example.com/c1.jpg" },
            { mediaType: "image", url: "https://cdn.example.com/c2.jpg" },
          ],
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishFacebookPageContent).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("queues a scheduled publish job", async () => {
    const publishAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockedCreatePublishJob.mockResolvedValue({
      id: "job_1",
      publishAt: new Date(publishAt),
    } as Awaited<ReturnType<typeof createPublishJob>>);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Scheduled caption",
        publishAt,
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "scheduled",
      id: "job_1",
    });
    expect(mockedPreflightMetaMedia).toHaveBeenCalledTimes(1);
    expect(mockedCreatePublishJob).toHaveBeenCalledTimes(1);
    expect(mockedCreatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        firstComment: undefined,
        locationId: undefined,
        userTags: undefined,
      }),
    );
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("preserves reel share-to-feed selection for scheduled jobs", async () => {
    const publishAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    mockedCreatePublishJob.mockResolvedValue({
      id: "job_1",
      publishAt: new Date(publishAt),
    } as Awaited<ReturnType<typeof createPublishJob>>);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Scheduled reel",
        publishAt,
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: false,
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockedCreatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: false,
        },
      }),
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
    mockedCreatePublishJob.mockResolvedValue({
      id: "job_fb_1",
      publishAt: new Date(publishAt),
    } as Awaited<ReturnType<typeof createPublishJob>>);
    mockedSyncQueuedPublishJobRemoteState.mockResolvedValueOnce({
      id: "job_fb_1",
      publishAt: new Date(publishAt),
    } as Awaited<ReturnType<typeof syncQueuedPublishJobRemoteState>>);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "scheduled",
      destination: "facebook",
      id: "job_fb_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      publishAt,
    });
    expect(mockedPublishFacebookPageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Facebook scheduled",
        publishAt,
      }),
      expect.objectContaining({ pageId: "page_1" }),
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
      expect.any(String),
      "post_1",
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        destination: "facebook",
        desiredState: "scheduled",
        remoteState: "scheduled",
        remoteObjectId: "page_1_1",
        remoteContainerId: "photo_1",
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
    mockedCreatePublishJob.mockResolvedValue({
      id: "job_fb_1",
      publishAt: new Date(publishAt),
    } as Awaited<ReturnType<typeof createPublishJob>>);
    mockedPublishFacebookPageContent.mockRejectedValue(
      new Error("Meta schedule failed"),
    );

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
    });

    const res = await POST(req);

    expect(res.status).toBe(502);
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

  it("passes location and user tags for immediate image publish", async () => {
    const userTags = [{ username: "handle", x: 0.25, y: 0.75 }];
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Now",
        locationId: "12345",
        userTags,
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locationId: "12345",
        userTags,
      }),
    );
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        locationId: "12345",
        userTags,
      }),
      expect.objectContaining({ accessToken: "token" }),
    );
  });

  it("publishes Facebook images immediately when requested", async () => {
    mockedReserveImmediatePublishJob.mockResolvedValue({
      ...reservedJob,
      destination: "facebook",
    } as never);
    mockedPublishFacebookPageContent.mockResolvedValue({
      mode: "image",
      creationId: "photo_1",
      publishId: "page_1_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destination: "facebook",
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      destination: "facebook",
      publishId: "page_1_1",
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
        caption: "Now",
      }),
      expect.objectContaining({ pageId: "page_1" }),
    );
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("publishes to both destinations immediately and returns per-destination results", async () => {
    mockedReserveImmediatePublishJob
      .mockResolvedValueOnce({
        ...reservedJob,
        id: "job_fb_1",
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
      } as never)
      .mockResolvedValueOnce({
        ...reservedJob,
        id: "job_ig_1",
        destination: "instagram",
      } as never);
    mockedPublishFacebookPageContent.mockResolvedValue({
      mode: "image",
      creationId: "photo_1",
      publishId: "page_1_1",
    });
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "both",
        caption: "Now",
        firstComment: "First comment",
        locationId: "12345",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      target: "both",
      results: [
        expect.objectContaining({
          destination: "facebook",
          publishId: "page_1_1",
        }),
        expect.objectContaining({
          destination: "instagram",
          publishId: "publish_1",
          firstCommentStatus: "posted",
        }),
      ],
    });
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledTimes(2);
    expect(mockedPublishFacebookPageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Now",
      }),
      expect.objectContaining({ pageId: "page_1" }),
    );
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Now",
        locationId: "12345",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
      }),
      expect.objectContaining({ accessToken: "token" }),
    );
    expect(mockedPublishInstagramFirstComment).toHaveBeenCalledWith(
      "publish_1",
      "First comment",
      expect.objectContaining({ accessToken: "token" }),
    );
  });

  it("returns partial success when one both destination fails", async () => {
    mockedReserveImmediatePublishJob
      .mockResolvedValueOnce({
        ...reservedJob,
        id: "job_fb_1",
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
      } as never)
      .mockResolvedValueOnce({
        ...reservedJob,
        id: "job_ig_1",
        destination: "instagram",
      } as never);
    mockedPublishFacebookPageContent.mockRejectedValue(
      new Error("Facebook publish failed"),
    );
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "both",
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "partial",
      target: "both",
      results: [
        expect.objectContaining({
          destination: "instagram",
          publishId: "publish_1",
        }),
      ],
      errors: [
        expect.objectContaining({
          destination: "facebook",
          error: "Facebook publish failed",
        }),
      ],
    });
    expect(mockedCompletePublishJobFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_fb_1" }),
      "Facebook publish failed",
    );
  });

  it("defaults reel share-to-feed to true for immediate publish", async () => {
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "reel",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Reel now",
        media: { mode: "reel", videoUrl: "https://cdn.example.com/reel.mp4" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: true,
        },
      }),
    );
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "reel",
        shareToFeed: true,
      }),
      expect.objectContaining({ accessToken: "token" }),
    );
  });

  it("publishes immediately and updates linked post", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: "post_1" }]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        postId: "post_1",
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      publishId: "publish_1",
    });
    expect(mockedPreflightMetaMedia).toHaveBeenCalledTimes(1);
    expect(mockedReserveImmediatePublishJob).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramContent).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramFirstComment).not.toHaveBeenCalled();
    expect(mockedCompletePublishJobSuccess).toHaveBeenCalledTimes(1);
    expect(mockedCompletePublishJobFailure).not.toHaveBeenCalled();
    expect(mockedMarkPostPublished).toHaveBeenCalledTimes(1);
    expect(mockedMarkPostPublished).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "post_1",
      "publish_1",
      "instagram",
    );
  });

  it("posts first comment after immediate publish when provided", async () => {
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Now",
        firstComment: "First comment",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      firstCommentStatus: "posted",
    });
    expect(mockedPublishInstagramFirstComment).toHaveBeenCalledWith(
      "publish_1",
      "First comment",
      expect.objectContaining({ accessToken: "token" }),
    );
  });

  it("returns publish success when first comment publish fails", async () => {
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });
    mockedPublishInstagramFirstComment.mockRejectedValue(
      new Error("comment denied"),
    );

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Now",
        firstComment: "First comment",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      firstCommentStatus: "failed",
      firstCommentWarning: "comment denied",
    });
    expect(mockedCompletePublishJobSuccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_1" }),
      expect.objectContaining({
        warningDetail: "comment denied",
      }),
    );
  });

  it("returns 400 when the account hits the 24h publish limit", async () => {
    mockedReserveImmediatePublishJob.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
    expect(mockedCompletePublishJobSuccess).not.toHaveBeenCalled();
  });

  it("returns 400 when media preflight fails", async () => {
    mockedPreflightMetaMedia.mockRejectedValue(
      new MetaMediaPreflightError("Image URL must use HTTPS."),
    );

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });

  it("returns success when publish-job success logging fails", async () => {
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });
    mockedCompletePublishJobSuccess.mockRejectedValue(
      new Error("db transient"),
    );

    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Now",
        media: { mode: "image", imageUrl: "https://cdn.example.com/image.jpg" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "published",
      publishId: "publish_1",
    });
  });
});
