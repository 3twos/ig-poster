import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

vi.mock("@/lib/meta-auth", () => ({
  resolveMetaAuthFromRequest: vi.fn(),
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
  markPostPublished: vi.fn(),
  reserveImmediatePublishJob: vi.fn(),
}));

vi.mock("@/lib/blob-store", () => ({
  isBlobEnabled: vi.fn(),
  putJson: vi.fn(),
}));

vi.mock("@/lib/meta", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta")>("@/lib/meta");
  return {
    ...actual,
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
import { publishInstagramContent, publishInstagramFirstComment } from "@/lib/meta";
import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";
import {
  completePublishJobFailure,
  completePublishJobSuccess,
  createPublishJob,
  markPostPublished,
  reserveImmediatePublishJob,
} from "@/lib/publish-jobs";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);
const mockedResolveMetaAuth = vi.mocked(resolveMetaAuthFromRequest);
const mockedPreflightMetaMedia = vi.mocked(preflightMetaMediaForPublish);
const mockedCreatePublishJob = vi.mocked(createPublishJob);
const mockedReserveImmediatePublishJob = vi.mocked(reserveImmediatePublishJob);
const mockedPublishInstagramContent = vi.mocked(publishInstagramContent);
const mockedPublishInstagramFirstComment = vi.mocked(publishInstagramFirstComment);
const mockedCompletePublishJobSuccess = vi.mocked(completePublishJobSuccess);
const mockedCompletePublishJobFailure = vi.mocked(completePublishJobFailure);
const mockedMarkPostPublished = vi.mocked(markPostPublished);

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
        graphVersion: "v22.0",
      },
      account: {
        connectionId: "conn_1",
        instagramUserId: "ig-id",
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

  it("returns 400 when image-only metadata is provided for non-image media", async () => {
    const req = new Request("https://app.example.com/api/meta/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        caption: "Invalid",
        locationId: "12345",
        media: { mode: "reel", videoUrl: "https://cdn.example.com/reel.mp4" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockedPreflightMetaMedia).not.toHaveBeenCalled();
    expect(mockedReserveImmediatePublishJob).not.toHaveBeenCalled();
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
