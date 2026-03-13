import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  deleteFacebookPagePost: vi.fn(),
  getEnvMetaAuth: vi.fn(),
  updateFacebookPagePost: vi.fn(),
}));

vi.mock("@/lib/meta-media-preflight", () => ({
  MetaMediaPreflightError: class MetaMediaPreflightError extends Error {},
  preflightMetaMediaForPublish: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForApi: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  upsertPostDestinationRemoteState: vi.fn(),
}));

import { getDb } from "@/db";
import {
  deleteFacebookPagePost,
  getEnvMetaAuth,
  updateFacebookPagePost,
} from "@/lib/meta";
import { preflightMetaMediaForPublish } from "@/lib/meta-media-preflight";
import { resolveMetaAuthForApi } from "@/services/meta-auth";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";
import { updatePublishJob } from "@/services/publish-jobs";

const mockedGetDb = vi.mocked(getDb);
const mockedDeleteFacebookPagePost = vi.mocked(deleteFacebookPagePost);
const mockedGetEnvMetaAuth = vi.mocked(getEnvMetaAuth);
const mockedPreflightMetaMedia = vi.mocked(preflightMetaMediaForPublish);
const mockedResolveMetaAuthForApi = vi.mocked(resolveMetaAuthForApi);
const mockedUpdateFacebookPagePost = vi.mocked(updateFacebookPagePost);
const mockedUpsertPostDestinationRemoteState = vi.mocked(upsertPostDestinationRemoteState);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "bearer" as const,
  scopes: ["queue:read", "queue:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

const buildJob = (
  overrides: Partial<Awaited<ReturnType<typeof updatePublishJob>> & {
    destination: "facebook" | "instagram";
    remoteAuthority: "remote_authoritative" | "app_managed";
  }> = {},
) => ({
  id: "job-1",
  ownerHash: "hash",
  postId: null,
  destination: "instagram" as const,
  remoteAuthority: "app_managed" as const,
  accountKey: null,
  pageId: null,
  instagramUserId: null,
  status: "failed" as const,
  caption: "Launch day",
  firstComment: null,
  locationId: null,
  userTags: null,
  media: { mode: "image" as const, imageUrl: "https://cdn.example.com/post.jpg" },
  publishAt: new Date("2026-03-10T18:30:00.000Z"),
  attempts: 1,
  maxAttempts: 3,
  lastAttemptAt: null,
  lastError: "timeout",
  authSource: "oauth" as const,
  connectionId: null,
  outcomeContext: null,
  publishId: null,
  creationId: null,
  children: null,
  completedAt: null,
  canceledAt: null,
  events: [],
  createdAt: new Date("2026-03-08T10:00:00.000Z"),
  updatedAt: new Date("2026-03-08T11:00:00.000Z"),
  ...overrides,
});

describe("updatePublishJob", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedDeleteFacebookPagePost.mockReset();
    mockedGetEnvMetaAuth.mockReset();
    mockedPreflightMetaMedia.mockReset();
    mockedResolveMetaAuthForApi.mockReset();
    mockedUpdateFacebookPagePost.mockReset();
    mockedUpsertPostDestinationRemoteState.mockReset();

    mockedPreflightMetaMedia.mockResolvedValue(undefined);
  });

  it("moves linked posts back to draft when move-to-draft succeeds", async () => {
    const job = buildJob({
      postId: "post-1",
    });

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    const selectLimitPost = vi.fn().mockResolvedValue([{ status: "scheduled" }]);
    const selectWherePost = vi.fn(() => ({ limit: selectLimitPost }));
    const selectFromPosts = vi.fn(() => ({ where: selectWherePost }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: selectFromJobs })
      .mockReturnValueOnce({ from: selectFromPosts });

    const updateReturningJob = vi.fn().mockResolvedValue([
      { ...job, status: "canceled", canceledAt: new Date("2026-03-08T12:00:00.000Z") },
    ]);
    const updateWhereJob = vi.fn(() => ({ returning: updateReturningJob }));
    const updateSetJob = vi.fn(() => ({ where: updateWhereJob }));
    const updateWherePost = vi.fn().mockResolvedValue(undefined);
    const updateSetPost = vi.fn(() => ({ where: updateWherePost }));
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: updateSetJob })
      .mockReturnValueOnce({ set: updateSetPost });

    mockedGetDb.mockReturnValue({
      select,
      update,
    } as unknown as ReturnType<typeof getDb>);

    const updated = await updatePublishJob(actor, "job-1", {
      action: "move-to-draft",
    });

    expect(updated.status).toBe("canceled");
    expect(updateSetPost).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    );
  });

  it("cancels Meta-synced Facebook schedules remotely and syncs local destination state", async () => {
    const job = buildJob({
      postId: "post-1",
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      status: "queued",
      connectionId: "conn-1",
      publishId: "page_1_1",
      creationId: "photo_1",
      pageId: "page-id",
      instagramUserId: "ig-id",
    });

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    const selectLimitPost = vi.fn().mockResolvedValue([{ status: "scheduled" }]);
    const selectWherePost = vi.fn(() => ({ limit: selectLimitPost }));
    const selectFromPosts = vi.fn(() => ({ where: selectWherePost }));
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: selectFromJobs })
      .mockReturnValueOnce({ from: selectFromPosts });

    const updateReturningJob = vi.fn().mockResolvedValue([
      { ...job, status: "canceled", canceledAt: new Date("2026-03-08T12:00:00.000Z") },
    ]);
    const updateWhereJob = vi.fn(() => ({ returning: updateReturningJob }));
    const updateSetJob = vi.fn(() => ({ where: updateWhereJob }));
    const updateWherePost = vi.fn().mockResolvedValue(undefined);
    const updateSetPost = vi.fn(() => ({ where: updateWherePost }));
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: updateSetJob })
      .mockReturnValueOnce({ set: updateSetPost });

    mockedGetDb.mockReturnValue({
      select,
      update,
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
    } as never);
    mockedDeleteFacebookPagePost.mockResolvedValue({ deletedId: "page_1_1" });

    const updated = await updatePublishJob(actor, "job-1", {
      action: "move-to-draft",
    });

    expect(updated.status).toBe("canceled");
    expect(mockedDeleteFacebookPagePost).toHaveBeenCalledWith(
      {
        publishId: "page_1_1",
        creationId: "photo_1",
      },
      expect.objectContaining({
        accessToken: "token",
        pageId: "page-id",
      }),
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post-1",
        destination: "facebook",
        desiredState: "draft",
        remoteState: "canceled",
        remoteObjectId: null,
      }),
    );
  });

  it("reschedules Meta-synced Facebook jobs through the Graph API", async () => {
    const job = buildJob({
      postId: "post-1",
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      status: "queued",
      connectionId: "conn-1",
      publishId: "page_1_1",
      creationId: "photo_1",
      pageId: "page-id",
      instagramUserId: "ig-id",
      caption: "Original caption",
    });
    const nextPublishAt = "2026-03-12T22:00:00.000Z";

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    const select = vi.fn().mockReturnValueOnce({ from: selectFromJobs });

    const updatedJob = {
      ...job,
      status: "queued" as const,
      publishAt: new Date(nextPublishAt),
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
    };
    const updateReturningJob = vi.fn().mockResolvedValue([updatedJob]);
    const updateWhereJob = vi.fn(() => ({ returning: updateReturningJob }));
    const updateSetJob = vi.fn(() => ({ where: updateWhereJob }));
    const updateWherePost = vi.fn().mockResolvedValue(undefined);
    const updateSetPost = vi.fn(() => ({ where: updateWherePost }));
    const update = vi
      .fn()
      .mockReturnValueOnce({ set: updateSetJob })
      .mockReturnValueOnce({ set: updateSetPost });

    mockedGetDb.mockReturnValue({
      select,
      update,
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
    } as never);
    mockedUpdateFacebookPagePost.mockResolvedValue({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: false,
      scheduledPublishTime: nextPublishAt,
      remotePermalink: "https://facebook.com/page/posts/1",
    });

    const updated = await updatePublishJob(actor, "job-1", {
      action: "reschedule",
      publishAt: nextPublishAt,
    });

    expect(updated.publishAt.toISOString()).toBe(nextPublishAt);
    expect(mockedUpdateFacebookPagePost).toHaveBeenCalledWith(
      {
        mediaMode: "image",
        publishId: "page_1_1",
        creationId: "photo_1",
        publishAt: nextPublishAt,
      },
      expect.objectContaining({
        accessToken: "token",
      }),
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post-1",
        destination: "facebook",
        desiredState: "scheduled",
        remoteState: "scheduled",
        remoteObjectId: "page_1_1",
      }),
    );
  });

  it("blocks media changes for Meta-synced Facebook jobs", async () => {
    const job = buildJob({
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      status: "queued",
      publishId: "page_1_1",
      creationId: "photo_1",
      connectionId: "conn-1",
      pageId: "page-id",
      instagramUserId: "ig-id",
    });

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFromJobs })),
      update: vi.fn(),
    } as unknown as ReturnType<typeof getDb>);

    await expect(
      updatePublishJob(actor, "job-1", {
        action: "edit",
        media: { mode: "image", imageUrl: "https://cdn.example.com/next.jpg" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Media changes are not supported for Meta-synced Facebook schedules yet.",
    });

    expect(mockedUpdateFacebookPagePost).not.toHaveBeenCalled();
  });

  it("rejects retry-now for Meta-synced Facebook schedules", async () => {
    const job = buildJob({
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      status: "failed",
      connectionId: "conn-1",
      publishId: "page_1_1",
      creationId: "photo_1",
      pageId: "page-id",
      instagramUserId: "ig-id",
    });

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFromJobs })),
      update: vi.fn(),
    } as unknown as ReturnType<typeof getDb>);

    await expect(
      updatePublishJob(actor, "job-1", {
        action: "retry-now",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "Retry now is not available for Meta-synced Facebook schedules. Create a new schedule instead.",
    });
  });

  it("rejects carousel-level user tags during edit", async () => {
    const job = buildJob({
      status: "queued",
      media: {
        mode: "carousel" as const,
        items: [
          { mediaType: "image" as const, url: "https://cdn.example.com/a.jpg" },
          { mediaType: "image" as const, url: "https://cdn.example.com/b.jpg" },
        ],
      },
    });
    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFromJobs })),
      update: vi.fn(),
    } as unknown as ReturnType<typeof getDb>);

    await expect(
      updatePublishJob(actor, "job-1", {
        action: "edit",
        userTags: [{ username: "brand", x: 0.5, y: 0.5 }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "Carousel posts use per-item user tags instead of a single post-level tag list.",
    });
  });

  it("returns a conflict when a concurrent update wins the race", async () => {
    const job = buildJob();

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    const updateReturningJob = vi.fn().mockResolvedValue([]);
    const updateWhereJob = vi.fn(() => ({ returning: updateReturningJob }));
    const updateSetJob = vi.fn(() => ({ where: updateWhereJob }));

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFromJobs })),
      update: vi.fn(() => ({ set: updateSetJob })),
    } as unknown as ReturnType<typeof getDb>);

    await expect(
      updatePublishJob(actor, "job-1", {
        action: "retry-now",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Publish job state changed concurrently. Refresh and try again.",
    });
  });

  it("uses env auth when a Meta-synced Facebook job has env-backed credentials", async () => {
    const job = buildJob({
      destination: "facebook",
      remoteAuthority: "remote_authoritative",
      status: "queued",
      authSource: "env",
      connectionId: null,
      publishId: "page_1_1",
      creationId: "photo_1",
    });
    const nextPublishAt = "2026-03-12T22:00:00.000Z";

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    const select = vi.fn().mockReturnValueOnce({ from: selectFromJobs });
    const updateReturningJob = vi.fn().mockResolvedValue([
      {
        ...job,
        publishAt: new Date(nextPublishAt),
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
      },
    ]);
    const updateWhereJob = vi.fn(() => ({ returning: updateReturningJob }));
    const updateSetJob = vi.fn(() => ({ where: updateWhereJob }));
    const update = vi.fn().mockReturnValueOnce({ set: updateSetJob });

    mockedGetDb.mockReturnValue({
      select,
      update,
    } as unknown as ReturnType<typeof getDb>);
    mockedGetEnvMetaAuth.mockReturnValue({
      accessToken: "env-token",
      instagramUserId: "ig-id",
      pageId: "page-id",
      graphVersion: "v22.0",
    });
    mockedUpdateFacebookPagePost.mockResolvedValue({
      remoteObjectId: "page_1_1",
      publishId: "page_1_1",
      creationId: "photo_1",
      isPublished: false,
      scheduledPublishTime: nextPublishAt,
    });

    const updated = await updatePublishJob(actor, "job-1", {
      action: "reschedule",
      publishAt: nextPublishAt,
    });

    expect(updated.publishAt.toISOString()).toBe(nextPublishAt);
    expect(mockedUpdateFacebookPagePost).toHaveBeenCalledWith(
      expect.objectContaining({
        publishId: "page_1_1",
      }),
      expect.objectContaining({
        accessToken: "env-token",
      }),
    );
  });
});
