import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
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

import { PATCH } from "@/app/api/publish-jobs/[id]/route";
import { getDb } from "@/db";
import {
  MetaMediaPreflightError,
  preflightMetaMediaForPublish,
} from "@/lib/meta-media-preflight";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedPreflightMetaMedia = vi.mocked(preflightMetaMediaForPublish);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const baseJob = {
  id: "job_1",
  ownerHash: "owner_hash",
  postId: null,
  status: "failed" as const,
  caption: "Caption",
  firstComment: null,
  locationId: null,
  userTags: null,
  media: { mode: "image" as const, imageUrl: "https://cdn.example.com/image.jpg" },
  publishAt: new Date("2026-03-06T21:00:00.000Z"),
  attempts: 3,
  maxAttempts: 3,
  lastAttemptAt: new Date("2026-03-06T20:00:00.000Z"),
  lastError: "boom",
  authSource: "oauth",
  connectionId: "conn_1",
  outcomeContext: null,
  publishId: null,
  creationId: null,
  children: null,
  completedAt: new Date("2026-03-06T20:00:00.000Z"),
  canceledAt: null,
  events: [],
  createdAt: new Date("2026-03-06T19:00:00.000Z"),
  updatedAt: new Date("2026-03-06T20:00:00.000Z"),
};

describe("PATCH /api/publish-jobs/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedPreflightMetaMedia.mockResolvedValue(undefined);
  });

  it("returns 401 when workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when publish job is not found", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 409 for Meta-synced Facebook jobs that are managed remotely", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          ...baseJob,
          destination: "facebook" as const,
          remoteAuthority: "remote_authoritative" as const,
          status: "queued" as const,
        },
      ]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error:
        "Meta-synced Facebook jobs must be managed in Meta tools until remote edit and cancel support is implemented in-app.",
    });
  });

  it("returns 409 when cancel update loses race", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ ...baseJob, status: "queued" }]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Publish job state changed concurrently. Refresh and try again.",
    });
  });

  it("moves queued jobs back to draft when requested", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const queuedJob = { ...baseJob, status: "queued" as const, postId: "post_1" };
    const jobSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([queuedJob]),
    };
    const postSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ status: "scheduled" as const }]),
    };
    const jobUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        { ...queuedJob, status: "canceled" as const, canceledAt: new Date() },
      ]),
    };
    const postUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn()
        .mockReturnValueOnce(jobSelectChain)
        .mockReturnValueOnce(postSelectChain),
      update: vi.fn()
        .mockReturnValueOnce(jobUpdateChain)
        .mockReturnValueOnce(postUpdateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move-to-draft" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });

    expect(res.status).toBe(200);
    expect(jobUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "canceled",
        canceledAt: expect.any(Date),
      }),
    );
    expect(postUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
      }),
    );
  });

  it("returns an action-specific conflict for move-to-draft on published jobs", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        { ...baseJob, status: "published" as const, postId: "post_1" },
      ]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move-to-draft" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Cannot move a published job back to draft.",
    });
  });

  it("resets attempts when rescheduling a failed job", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      publishAt: new Date("2026-03-06T22:00:00.000Z"),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reschedule",
        publishAt: "2026-03-06T22:00:00.000Z",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
      }),
    );
  });

  it("queues immediate retry for failed jobs", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      publishAt: new Date(),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "retry-now",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "queued",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
        publishAt: expect.any(Date),
      }),
    );
  });

  it("returns 409 when retry-now is used on non-failed job", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ ...baseJob, status: "queued" }]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn(),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "retry-now",
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid payload", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "edit" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(400);
  });

  it("resets attempts when editing a failed job", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      caption: "Updated",
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "edit", caption: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(mockedPreflightMetaMedia).not.toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        completedAt: null,
      }),
    );
  });

  it("allows clearing first comment during edit", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ ...baseJob, firstComment: "Old comment" }]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      firstComment: null,
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "edit", firstComment: null }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        firstComment: null,
      }),
    );
  });

  it("stores location id and user tags during image edit", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const userTags = [{ username: "handle", x: 0.2, y: 0.8 }];
    const updated = {
      ...baseJob,
      status: "queued" as const,
      locationId: "12345",
      userTags,
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        locationId: "12345",
        userTags,
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "12345",
        userTags,
      }),
    );
  });

  it("stores reel location id and user tags during edit", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          ...baseJob,
          media: {
            mode: "reel" as const,
            videoUrl: "https://cdn.example.com/reel.mp4",
            shareToFeed: true,
          },
        },
      ]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([
        {
          ...baseJob,
          status: "queued" as const,
          locationId: "12345",
          userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
          media: {
            mode: "reel" as const,
            videoUrl: "https://cdn.example.com/reel.mp4",
            shareToFeed: true,
          },
        },
      ]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        locationId: "12345",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "12345",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
      }),
    );
  });

  it("rejects post-level user tags for carousel jobs", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          ...baseJob,
          media: {
            mode: "carousel" as const,
            items: [
              { mediaType: "image" as const, url: "https://cdn.example.com/c1.jpg" },
              { mediaType: "image" as const, url: "https://cdn.example.com/c2.jpg" },
            ],
          },
        },
      ]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Carousel posts use per-item user tags instead of a single post-level tag list.",
    });
    expect(updateChain.set).not.toHaveBeenCalled();
  });

  it("rejects user tags on carousel video items", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        media: {
          mode: "carousel",
          items: [
            {
              mediaType: "image",
              url: "https://cdn.example.com/c1.jpg",
              userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
            },
            {
              mediaType: "video",
              url: "https://cdn.example.com/c2.mp4",
              userTags: [{ username: "friend", x: 0.5, y: 0.5 }],
            },
          ],
        },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "User tags are not supported on carousel videos.",
    });
    expect(updateChain.set).not.toHaveBeenCalled();
  });

  it("stores reel share-to-feed edits", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          ...baseJob,
          media: {
            mode: "reel" as const,
            videoUrl: "https://cdn.example.com/reel.mp4",
            shareToFeed: true,
          },
        },
      ]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      media: {
        mode: "reel" as const,
        videoUrl: "https://cdn.example.com/reel.mp4",
        shareToFeed: false,
      },
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: false,
        },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        media: {
          mode: "reel",
          videoUrl: "https://cdn.example.com/reel.mp4",
          shareToFeed: false,
        },
      }),
    );
  });

  it("preflights media URLs when editing media payload", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updated = {
      ...baseJob,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      completedAt: null,
      media: { mode: "image" as const, imageUrl: "https://cdn.example.com/new.jpg" },
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        media: { mode: "image", imageUrl: "https://cdn.example.com/new.jpg" },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(200);
    expect(mockedPreflightMetaMedia).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when media preflight fails for edit", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    mockedPreflightMetaMedia.mockRejectedValue(
      new MetaMediaPreflightError("Image URL must use HTTPS."),
    );

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([baseJob]),
    };
    const updateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        media: { mode: "image", imageUrl: "https://cdn.example.com/new.jpg" },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(400);
    expect(updateChain.set).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected server errors", async () => {
    mockedReadWorkspace.mockResolvedValue(session);
    mockedGetDb.mockImplementation(() => {
      throw new Error("db down");
    });

    const req = new Request("https://app.example.com/api/publish-jobs/job_1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "job_1" }) });
    expect(res.status).toBe(500);
  });
});
