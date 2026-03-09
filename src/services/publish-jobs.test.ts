import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/meta-media-preflight", () => ({
  MetaMediaPreflightError: class MetaMediaPreflightError extends Error {},
  preflightMetaMediaForPublish: vi.fn(),
}));

import { getDb } from "@/db";
import { updatePublishJob } from "@/services/publish-jobs";

const mockedGetDb = vi.mocked(getDb);

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

describe("updatePublishJob", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
  });

  it("moves linked posts back to draft when move-to-draft succeeds", async () => {
    const job = {
      id: "job-1",
      ownerHash: "hash",
      postId: "post-1",
      status: "failed",
      caption: "Launch day",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: { mode: "image", imageUrl: "https://cdn.example.com/post.jpg" },
      publishAt: new Date("2026-03-10T18:30:00.000Z"),
      attempts: 1,
      maxAttempts: 3,
      lastAttemptAt: null,
      lastError: "timeout",
      authSource: "oauth",
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
    };

    const selectLimitJob = vi.fn().mockResolvedValue([job]);
    const selectWhereJob = vi.fn(() => ({ limit: selectLimitJob }));
    const selectFromJobs = vi.fn(() => ({ where: selectWhereJob }));
    const selectLimitPost = vi.fn().mockResolvedValue([{ result: null }]);
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

  it("rejects carousel-level user tags during edit", async () => {
    const job = {
      id: "job-1",
      ownerHash: "hash",
      postId: null,
      status: "queued",
      caption: "Launch day",
      firstComment: null,
      locationId: null,
      userTags: null,
      media: {
        mode: "carousel",
        items: [
          { mediaType: "image", url: "https://cdn.example.com/a.jpg" },
          { mediaType: "image", url: "https://cdn.example.com/b.jpg" },
        ],
      },
      publishAt: new Date("2026-03-10T18:30:00.000Z"),
      attempts: 0,
      maxAttempts: 3,
      lastAttemptAt: null,
      lastError: null,
      authSource: "oauth",
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
    };
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
});
