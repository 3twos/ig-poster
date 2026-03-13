import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({
  listFacebookPageScheduledPosts: vi.fn(),
}));

vi.mock("@/lib/publish-jobs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/publish-jobs")>(
    "@/lib/publish-jobs",
  );

  return {
    ...actual,
    createPublishJob: vi.fn(),
  };
});

vi.mock("@/services/post-destinations", () => ({
  upsertPostDestinationRemoteState: vi.fn(),
}));

import { getDb } from "@/db";
import { listFacebookPageScheduledPosts } from "@/lib/meta";
import { createPublishJob } from "@/lib/publish-jobs";
import { syncFacebookScheduledPublishJobs } from "@/services/facebook-sync";
import { upsertPostDestinationRemoteState } from "@/services/post-destinations";

const mockedCreatePublishJob = vi.mocked(createPublishJob);
const mockedGetDb = vi.mocked(getDb);
const mockedListFacebookPageScheduledPosts = vi.mocked(listFacebookPageScheduledPosts);
const mockedUpsertPostDestinationRemoteState = vi.mocked(upsertPostDestinationRemoteState);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "cookie" as const,
  scopes: ["queue:read", "queue:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

const resolvedAuth = {
  source: "oauth" as const,
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
};

describe("syncFacebookScheduledPublishJobs", () => {
  beforeEach(() => {
    mockedCreatePublishJob.mockReset();
    mockedGetDb.mockReset();
    mockedListFacebookPageScheduledPosts.mockReset();
    mockedUpsertPostDestinationRemoteState.mockReset();
  });

  it("imports new remote Facebook schedules as local shadow jobs", async () => {
    mockedListFacebookPageScheduledPosts.mockResolvedValue([
      {
        remoteObjectId: "page_1_1",
        caption: "Imported caption",
        publishAt: "2026-03-20T18:30:00.000Z",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/imported.jpg",
        },
      },
    ]);

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

    mockedGetDb.mockReturnValue({
      select,
    } as unknown as ReturnType<typeof getDb>);

    const result = await syncFacebookScheduledPublishJobs(actor, resolvedAuth);

    expect(result).toEqual({
      imported: 1,
      updated: 0,
      unchanged: 0,
    });
    expect(mockedCreatePublishJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerHash: "hash",
        destination: "facebook",
        remoteAuthority: "remote_authoritative",
        caption: "Imported caption",
        publishId: "page_1_1",
      }),
    );
  });

  it("updates drifted remote-authoritative Facebook jobs", async () => {
    mockedListFacebookPageScheduledPosts.mockResolvedValue([
      {
        remoteObjectId: "page_1_1",
        caption: "Updated remotely",
        publishAt: "2026-03-20T18:30:00.000Z",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/imported.jpg",
        },
      },
    ]);

    const existingJob = {
      id: "job-1",
      ownerHash: "hash",
      postId: "post-1",
      destination: "facebook" as const,
      remoteAuthority: "remote_authoritative" as const,
      accountKey: "page-id:ig-id",
      pageId: "page-id",
      instagramUserId: "ig-id",
      status: "failed" as const,
      caption: "Stale caption",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: { mode: "image" as const, imageUrl: "https://cdn.example.com/old.jpg" },
      publishAt: new Date("2026-03-19T18:30:00.000Z"),
      attempts: 1,
      maxAttempts: 3,
      lastAttemptAt: null,
      lastError: "drift",
      authSource: "oauth" as const,
      connectionId: "conn-1",
      outcomeContext: null,
      publishId: "page_1_1",
      creationId: null,
      children: null,
      completedAt: new Date("2026-03-18T18:30:00.000Z"),
      canceledAt: null,
      events: [],
      createdAt: new Date("2026-03-18T10:00:00.000Z"),
      updatedAt: new Date("2026-03-18T10:00:00.000Z"),
    };

    const select = vi.fn().mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([existingJob]),
      }),
    });
    const updateReturning = vi.fn().mockResolvedValue([
      {
        ...existingJob,
        status: "queued",
        caption: "Updated remotely",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/imported.jpg",
        },
        publishAt: new Date("2026-03-20T18:30:00.000Z"),
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
      },
    ]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn(() => ({ where: updateWhere }));

    mockedGetDb.mockReturnValue({
      select,
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as ReturnType<typeof getDb>);

    const result = await syncFacebookScheduledPublishJobs(actor, resolvedAuth);

    expect(result).toEqual({
      imported: 0,
      updated: 1,
      unchanged: 0,
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        caption: "Updated remotely",
        attempts: 0,
      }),
    );
    expect(mockedUpsertPostDestinationRemoteState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        postId: "post-1",
        destination: "facebook",
        remoteState: "scheduled",
      }),
    );
  });

  it("returns unchanged when the remote schedule already matches local state", async () => {
    mockedListFacebookPageScheduledPosts.mockResolvedValue([
      {
        remoteObjectId: "page_1_1",
        caption: "Imported caption",
        publishAt: "2026-03-20T18:30:00.000Z",
        media: {
          mode: "image",
          imageUrl: "https://cdn.example.com/imported.jpg",
        },
      },
    ]);

    const existingJob = {
      id: "job-1",
      ownerHash: "hash",
      postId: null,
      destination: "facebook" as const,
      remoteAuthority: "remote_authoritative" as const,
      accountKey: "page-id:ig-id",
      pageId: "page-id",
      instagramUserId: "ig-id",
      status: "queued" as const,
      caption: "Imported caption",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: {
        mode: "image" as const,
        imageUrl: "https://cdn.example.com/imported.jpg",
      },
      publishAt: new Date("2026-03-20T18:30:00.000Z"),
      attempts: 0,
      maxAttempts: 3,
      lastAttemptAt: null,
      lastError: null,
      authSource: "oauth" as const,
      connectionId: "conn-1",
      outcomeContext: null,
      publishId: "page_1_1",
      creationId: null,
      children: null,
      completedAt: null,
      canceledAt: null,
      events: [],
      createdAt: new Date("2026-03-18T10:00:00.000Z"),
      updatedAt: new Date("2026-03-18T10:00:00.000Z"),
    };

    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingJob]),
        }),
      }),
      update: vi.fn(),
    } as unknown as ReturnType<typeof getDb>);

    const result = await syncFacebookScheduledPublishJobs(actor, resolvedAuth);

    expect(result).toEqual({
      imported: 0,
      updated: 0,
      unchanged: 1,
    });
    expect(mockedCreatePublishJob).not.toHaveBeenCalled();
  });

  it("skips syncing when the Meta account has no page id", async () => {
    const result = await syncFacebookScheduledPublishJobs(actor, {
      ...resolvedAuth,
      account: {
        ...resolvedAuth.account,
        pageId: undefined,
      },
    });

    expect(result).toEqual({
      imported: 0,
      updated: 0,
      unchanged: 0,
    });
    expect(mockedListFacebookPageScheduledPosts).not.toHaveBeenCalled();
  });
});
