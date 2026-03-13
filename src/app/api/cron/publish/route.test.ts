import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  getFacebookPagePublishState: vi.fn(),
  getEnvMetaAuth: vi.fn(),
  publishFacebookPageContent: vi.fn(),
  publishInstagramContent: vi.fn(),
  publishInstagramFirstComment: vi.fn(),
}));

vi.mock("@/lib/meta-auth", () => ({
  getMetaConnection: vi.fn(),
}));

vi.mock("@/lib/publish-jobs", () => ({
  claimDuePublishJobs: vi.fn(),
  completePublishJobFailure: vi.fn(),
  completePublishJobSuccess: vi.fn(),
  deferProcessingPublishJob: vi.fn(),
  getPublishWindowUsage: vi.fn(),
  markPostPublished: vi.fn(),
  recoverStaleProcessingJobs: vi.fn(),
}));

vi.mock("@/lib/app-encryption", () => ({
  requireAppEncryptionSecret: vi.fn(),
}));

vi.mock("@/lib/secure", () => ({
  decryptString: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  syncPublishedInstagramDestination: vi.fn(),
  upsertPostDestinationRemoteState: vi.fn(),
}));

import { GET } from "@/app/api/cron/publish/route";
import { getDb } from "@/db";
import { isBlobEnabled } from "@/lib/blob-store";
import {
  getFacebookPagePublishState,
  getEnvMetaAuth,
  publishFacebookPageContent,
  publishInstagramContent,
  publishInstagramFirstComment,
} from "@/lib/meta";
import {
  claimDuePublishJobs,
  completePublishJobFailure,
  completePublishJobSuccess,
  deferProcessingPublishJob,
  getPublishWindowUsage,
  markPostPublished,
  recoverStaleProcessingJobs,
} from "@/lib/publish-jobs";
import {
  syncPublishedInstagramDestination,
  upsertPostDestinationRemoteState,
} from "@/services/post-destinations";

const mockedGetDb = vi.mocked(getDb);
const mockedIsBlobEnabled = vi.mocked(isBlobEnabled);
const mockedGetFacebookPagePublishState = vi.mocked(getFacebookPagePublishState);
const mockedGetEnvMetaAuth = vi.mocked(getEnvMetaAuth);
const mockedPublishFacebookPageContent = vi.mocked(publishFacebookPageContent);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedPublishInstagramFirstComment = vi.mocked(publishInstagramFirstComment);
const mockedClaimDuePublishJobs = vi.mocked(claimDuePublishJobs);
const mockedCompletePublishJobFailure = vi.mocked(completePublishJobFailure);
const mockedCompletePublishJobSuccess = vi.mocked(completePublishJobSuccess);
const mockedDeferProcessingPublishJob = vi.mocked(deferProcessingPublishJob);
const mockedGetPublishWindowUsage = vi.mocked(getPublishWindowUsage);
const mockedMarkPostPublished = vi.mocked(markPostPublished);
const mockedRecoverStaleProcessingJobs = vi.mocked(recoverStaleProcessingJobs);
const mockedUpsertPostDestinationRemoteState = vi.mocked(
  upsertPostDestinationRemoteState,
);
const mockedSyncPublishedInstagramDestination = vi.mocked(
  syncPublishedInstagramDestination,
);

const baseJob = {
  id: "job_1",
  ownerHash: "owner_hash",
  postId: "post_1",
  destination: "instagram" as const,
  remoteAuthority: "app_managed" as const,
  accountKey: "page_1:ig-id",
  pageId: "page_1",
  instagramUserId: "ig-id",
  status: "processing" as const,
  caption: "Caption",
  firstComment: null,
  locationId: null,
  userTags: null,
  media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
  publishAt: new Date(),
  attempts: 1,
  maxAttempts: 3,
  lastAttemptAt: new Date(),
  lastError: null,
  authSource: "env",
  connectionId: null,
  outcomeContext: null,
  publishId: null,
  creationId: null,
  children: null,
  completedAt: null,
  canceledAt: null,
  events: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/cron/publish", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    mockedGetDb.mockReturnValue({} as ReturnType<typeof getDb>);
    mockedIsBlobEnabled.mockReturnValue(false);
    mockedPublishInstagramFirstComment.mockResolvedValue("comment_1");
    mockedRecoverStaleProcessingJobs.mockResolvedValue([]);
    mockedGetPublishWindowUsage.mockResolvedValue({
      limit: 50,
      used: 0,
      remaining: 50,
      windowStart: new Date("2026-03-06T00:00:00.000Z"),
    });
    mockedUpsertPostDestinationRemoteState.mockResolvedValue(undefined);
    mockedSyncPublishedInstagramDestination.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 for invalid bearer token", async () => {
    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer nope" },
    });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("publishes claimed jobs and marks success", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([baseJob]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      pageId: "page_1",
      graphVersion: "v22.0",
    });
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
      remotePermalink: "https://instagram.com/p/publish_1",
      publishedAt: "2026-03-13T16:00:00.000Z",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue(baseJob);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      staleFailed: 0,
      claimed: 1,
      published: 1,
      errorCount: 0,
    });

    expect(mockedPublishInstagramContent).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramFirstComment).not.toHaveBeenCalled();
    expect(mockedCompletePublishJobSuccess).toHaveBeenCalledTimes(1);
    expect(mockedGetPublishWindowUsage).toHaveBeenCalledTimes(1);
    expect(mockedMarkPostPublished).toHaveBeenCalledWith(
      expect.anything(),
      baseJob.ownerHash,
      baseJob.postId,
      "publish_1",
      "instagram",
      {
        remotePermalink: "https://instagram.com/p/publish_1",
        publishedAt: "2026-03-13T16:00:00.000Z",
      },
    );
    expect(mockedSyncPublishedInstagramDestination).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: baseJob.postId,
        remoteObjectId: "publish_1",
        remoteContainerId: "create_1",
        remotePermalink: "https://instagram.com/p/publish_1",
        publishedAt: "2026-03-13T16:00:00.000Z",
      }),
    );
  });

  it("reports stale processing jobs recovered before new claims", async () => {
    mockedRecoverStaleProcessingJobs.mockResolvedValue([
      { ...baseJob, id: "stale_1", status: "failed" },
    ]);
    mockedClaimDuePublishJobs.mockResolvedValue([]);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      staleFailed: 1,
      claimed: 0,
      published: 0,
      errorCount: 0,
    });
    expect(mockedRecoverStaleProcessingJobs).toHaveBeenCalledTimes(1);
  });

  it("passes image metadata fields when present on queued jobs", async () => {
    const userTags = [{ username: "handle", x: 0.4, y: 0.6 }];
    mockedClaimDuePublishJobs.mockResolvedValue([
      { ...baseJob, locationId: "12345", userTags },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      pageId: "page_1",
      graphVersion: "v22.0",
    });
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue(baseJob);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockedPublishInstagramContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        locationId: "12345",
        userTags,
      }),
      expect.objectContaining({ accessToken: "token" }),
    );
  });

  it("publishes Facebook jobs without applying the Instagram rolling limit", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([
      { ...baseJob, destination: "facebook" as const },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      pageId: "page_1",
      graphVersion: "v22.0",
    });
    mockedPublishFacebookPageContent.mockResolvedValue({
      mode: "image",
      creationId: "photo_1",
      publishId: "page_1_1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue({
      ...baseJob,
      destination: "facebook" as const,
      status: "published",
    } as never);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 1,
      failed: 0,
      errorCount: 0,
    });
    expect(mockedPublishFacebookPageContent).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "image",
        imageUrl: "https://cdn.example.com/image.jpg",
        caption: "Caption",
      }),
      expect.objectContaining({ pageId: "page_1" }),
    );
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
    expect(mockedGetPublishWindowUsage).not.toHaveBeenCalled();
    expect(mockedMarkPostPublished).toHaveBeenCalledWith(
      expect.anything(),
      baseJob.ownerHash,
      baseJob.postId,
      "page_1_1",
      "facebook",
      {
        remotePermalink: undefined,
        publishedAt: undefined,
      },
    );
  });

  it("defers remote-authoritative Facebook jobs until Meta marks them published", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([
      {
        ...baseJob,
        destination: "facebook" as const,
        remoteAuthority: "remote_authoritative" as const,
        publishId: "page_1_1",
        creationId: "photo_1",
      },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      pageId: "page_1",
      graphVersion: "v22.0",
    });
    mockedGetFacebookPagePublishState.mockResolvedValue({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: false,
      scheduledPublishTime: "2026-03-13T18:00:00.000Z",
    });
    mockedDeferProcessingPublishJob.mockResolvedValue({
      ...baseJob,
      destination: "facebook" as const,
      remoteAuthority: "remote_authoritative" as const,
      status: "queued",
    } as never);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 0,
      retried: 1,
      deferred: 1,
      failed: 0,
      errorCount: 0,
    });
    expect(mockedGetFacebookPagePublishState).toHaveBeenCalledWith(
      {
        publishId: "page_1_1",
        creationId: "photo_1",
      },
      expect.objectContaining({ pageId: "page_1" }),
    );
    expect(mockedPublishFacebookPageContent).not.toHaveBeenCalled();
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        destination: "facebook",
        desiredState: "scheduled",
        remoteState: "scheduled",
      }),
    );
    expect(mockedMarkPostPublished).not.toHaveBeenCalled();
  });

  it("marks remote-authoritative Facebook jobs published after Meta publishes them", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([
      {
        ...baseJob,
        destination: "facebook" as const,
        remoteAuthority: "remote_authoritative" as const,
        publishId: "page_1_1",
        creationId: "photo_1",
      },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      pageId: "page_1",
      graphVersion: "v22.0",
    });
    mockedGetFacebookPagePublishState.mockResolvedValue({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: true,
      scheduledPublishTime: "2026-03-13T18:00:00.000Z",
      remotePermalink: "https://facebook.com/page/posts/1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue({
      ...baseJob,
      destination: "facebook" as const,
      remoteAuthority: "remote_authoritative" as const,
      status: "published",
    } as never);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 1,
      failed: 0,
      errorCount: 0,
    });
    expect(mockedCompletePublishJobSuccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_1" }),
      expect.objectContaining({
        publishId: "page_1_1",
        creationId: "photo_1",
      }),
    );
    expect(mockedPublishFacebookPageContent).not.toHaveBeenCalled();
    expect(mockedMarkPostPublished).toHaveBeenCalledWith(
      expect.anything(),
      baseJob.ownerHash,
      baseJob.postId,
      "page_1_1",
      "facebook",
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post_1",
        destination: "facebook",
        desiredState: "published",
        remoteState: "published",
        remotePermalink: "https://facebook.com/page/posts/1",
      }),
    );
  });

  it("keeps remote-authoritative Facebook jobs published when post snapshot updates fail", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([
      {
        ...baseJob,
        destination: "facebook" as const,
        remoteAuthority: "remote_authoritative" as const,
        publishId: "page_1_1",
        creationId: "photo_1",
      },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      pageId: "page_1",
      graphVersion: "v22.0",
    });
    mockedGetFacebookPagePublishState.mockResolvedValue({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: true,
      scheduledPublishTime: "2026-03-13T18:00:00.000Z",
      remotePermalink: "https://facebook.com/page/posts/1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue({
      ...baseJob,
      destination: "facebook" as const,
      remoteAuthority: "remote_authoritative" as const,
      status: "published",
    } as never);
    mockedMarkPostPublished.mockRejectedValue(
      new Error("snapshot write failed"),
    );

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 1,
      failed: 0,
      errorCount: 1,
    });
    expect(mockedCompletePublishJobFailure).not.toHaveBeenCalled();
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalled();
  });

  it("posts first comment for jobs that include one", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([
      { ...baseJob, firstComment: "First comment" },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      graphVersion: "v22.0",
    });
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });
    mockedCompletePublishJobSuccess.mockResolvedValue(baseJob);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockedPublishInstagramFirstComment).toHaveBeenCalledWith(
      "publish_1",
      "First comment",
      expect.objectContaining({ accessToken: "token" }),
    );
    expect(mockedCompletePublishJobSuccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_1" }),
      expect.not.objectContaining({ warningDetail: expect.any(String) }),
    );
  });

  it("marks publish success with warning when first comment fails", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([
      { ...baseJob, firstComment: "First comment" },
    ]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      graphVersion: "v22.0",
    });
    mockedPublishInstagramContent.mockResolvedValue({
      mode: "image",
      creationId: "create_1",
      publishId: "publish_1",
    });
    mockedPublishInstagramFirstComment.mockRejectedValue(
      new Error("comment denied"),
    );
    mockedCompletePublishJobSuccess.mockResolvedValue(baseJob);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockedCompletePublishJobSuccess).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "job_1" }),
      expect.objectContaining({ warningDetail: "comment denied" }),
    );
  });

  it("records failures and retry transitions", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([baseJob]);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "token",
      instagramUserId: "ig-id",
      graphVersion: "v22.0",
    });
    mockedPublishInstagramContent.mockRejectedValue(new Error("Upstream failure"));
    mockedCompletePublishJobFailure.mockResolvedValue({
      ...baseJob,
      status: "queued",
    });

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 0,
      retried: 1,
      failed: 0,
      errorCount: 1,
    });
    expect(mockedCompletePublishJobFailure).toHaveBeenCalledTimes(1);
  });

  it("defers processing jobs when 24h publish window is full", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([baseJob]);
    mockedGetPublishWindowUsage.mockResolvedValue({
      limit: 50,
      used: 50,
      remaining: 0,
      windowStart: new Date("2026-03-06T00:00:00.000Z"),
    });
    mockedDeferProcessingPublishJob.mockResolvedValue({
      ...baseJob,
      status: "queued",
    });

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 0,
      retried: 1,
      deferred: 1,
      failed: 0,
      errorCount: 0,
    });
    expect(mockedDeferProcessingPublishJob).toHaveBeenCalledTimes(1);
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
    expect(mockedCompletePublishJobFailure).not.toHaveBeenCalled();
  });

  it("does not consume retries when quota deferral update loses race", async () => {
    mockedClaimDuePublishJobs.mockResolvedValue([baseJob]);
    mockedGetPublishWindowUsage.mockResolvedValue({
      limit: 50,
      used: 50,
      remaining: 0,
      windowStart: new Date("2026-03-06T00:00:00.000Z"),
    });
    mockedDeferProcessingPublishJob.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/cron/publish", {
      headers: { authorization: "Bearer cron-secret" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      claimed: 1,
      published: 0,
      retried: 0,
      deferred: 0,
      failed: 0,
      errorCount: 1,
    });
    expect(mockedCompletePublishJobFailure).not.toHaveBeenCalled();
    expect(mockedPublishInstagramContent).not.toHaveBeenCalled();
  });
});
