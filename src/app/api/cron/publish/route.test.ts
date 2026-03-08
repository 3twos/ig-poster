import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  getEnvMetaAuth: vi.fn(),
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

import { GET } from "@/app/api/cron/publish/route";
import { getDb } from "@/db";
import { isBlobEnabled } from "@/lib/blob-store";
import {
  getEnvMetaAuth,
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

const mockedGetDb = vi.mocked(getDb);
const mockedIsBlobEnabled = vi.mocked(isBlobEnabled);
const mockedGetEnvMetaAuth = vi.mocked(getEnvMetaAuth);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedPublishInstagramFirstComment = vi.mocked(publishInstagramFirstComment);
const mockedClaimDuePublishJobs = vi.mocked(claimDuePublishJobs);
const mockedCompletePublishJobFailure = vi.mocked(completePublishJobFailure);
const mockedCompletePublishJobSuccess = vi.mocked(completePublishJobSuccess);
const mockedDeferProcessingPublishJob = vi.mocked(deferProcessingPublishJob);
const mockedGetPublishWindowUsage = vi.mocked(getPublishWindowUsage);
const mockedMarkPostPublished = vi.mocked(markPostPublished);
const mockedRecoverStaleProcessingJobs = vi.mocked(recoverStaleProcessingJobs);

const baseJob = {
  id: "job_1",
  ownerHash: "owner_hash",
  postId: "post_1",
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
