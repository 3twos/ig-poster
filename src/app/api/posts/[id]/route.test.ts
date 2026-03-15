import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  deletePost: vi.fn(),
  getPost: vi.fn(),
  PostServiceError: class PostServiceError extends Error {
    status = 409;
  },
  updatePost: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  getStoredPostDestinations: vi.fn(),
}));

vi.mock("@/services/meta-auth", () => ({
  resolveMetaAuthForRequest: vi.fn(),
}));

vi.mock("@/services/instagram-sync", () => ({
  syncInstagramPublishedPost: vi.fn(),
}));

import { DELETE, GET, PUT } from "@/app/api/posts/[id]/route";
import { resolveActorFromRequest } from "@/services/actors";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { syncInstagramPublishedPost } from "@/services/instagram-sync";
import {
  deletePost,
  getPost,
  PostServiceError,
  updatePost,
} from "@/services/posts";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedUpdatePost = vi.mocked(updatePost);
const mockedDeletePost = vi.mocked(deletePost);
const mockedGetPost = vi.mocked(getPost);
const mockedGetStoredPostDestinations = vi.mocked(getStoredPostDestinations);
const mockedResolveMetaAuthForRequest = vi.mocked(resolveMetaAuthForRequest);
const mockedSyncInstagramPublishedPost = vi.mocked(syncInstagramPublishedPost);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
  authSource: "cookie",
} as never;

const instagramDestination = {
  id: "dest_1",
  postId: "p1",
  destination: "instagram",
  enabled: true,
  syncMode: "app_managed",
  desiredState: "draft",
  remoteState: "draft",
  caption: "Caption",
  firstComment: "First comment",
  locationId: "123",
  userTags: null,
  publishAt: null,
  remoteObjectId: null,
  remoteContainerId: null,
  remotePermalink: null,
  remoteStatePayload: {},
  lastSyncedAt: null,
  lastError: null,
  createdAt: new Date("2026-03-12T18:00:00.000Z"),
  updatedAt: new Date("2026-03-12T18:00:00.000Z"),
} as const;

const makePostRow = () => ({
  id: "p1",
  title: "Updated",
  status: "draft",
  publishSettings: {
    caption: "Caption",
    firstComment: "First comment",
    locationId: "123",
    reelShareToFeed: true,
  },
  publishHistory: [],
});

describe("PUT /api/posts/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
    mockedGetStoredPostDestinations.mockResolvedValue([]);
    mockedResolveMetaAuthForRequest.mockResolvedValue({
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
    } as never);
    mockedSyncInstagramPublishedPost.mockResolvedValue({
      attempted: true,
      synced: true,
    });
  });

  it("returns 401 when auth is missing", async () => {
    mockedResolveActorFromRequest.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid update payloads", async () => {
    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "broken-status" }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid request body" });
  });

  it("includes issues array in 400 response for non-production", async () => {
    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "broken-status" }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid request body");
    expect(body.issues).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("loads a post with destinations", async () => {
    mockedGetPost.mockResolvedValue(makePostRow() as never);
    mockedGetStoredPostDestinations.mockResolvedValue([instagramDestination] as never);

    const req = new Request("https://app.example.com/api/posts/p1");
    const res = await GET(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mockedGetStoredPostDestinations).toHaveBeenCalledWith("p1");
    await expect(res.json()).resolves.toMatchObject({
      id: "p1",
      destinations: expect.arrayContaining([
        expect.objectContaining({ destination: "instagram" }),
      ]),
    });
  });

  it("best-effort syncs posted Instagram state on load", async () => {
    mockedGetPost.mockResolvedValue({
      ...makePostRow(),
      status: "posted",
      publishHistory: [
        {
          publishedAt: "2026-03-13T16:00:00.000Z",
          igMediaId: "ig_media_1",
        },
      ],
      publishedAt: new Date("2026-03-13T16:00:00.000Z"),
    } as never);
    mockedGetStoredPostDestinations
      .mockResolvedValueOnce([
        {
          ...instagramDestination,
          desiredState: "published",
          remoteState: "published",
          remoteObjectId: "ig_media_1",
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          ...instagramDestination,
          desiredState: "published",
          remoteState: "published",
          remoteObjectId: "ig_media_1",
          remotePermalink: "https://instagram.com/p/ig_media_1",
        },
      ] as never);

    const req = new Request("https://app.example.com/api/posts/p1");
    const res = await GET(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mockedResolveMetaAuthForRequest).toHaveBeenCalledTimes(1);
    expect(mockedSyncInstagramPublishedPost).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        account: expect.objectContaining({
          instagramUserId: "ig-id",
        }),
      }),
      expect.objectContaining({ id: "p1", status: "posted" }),
      expect.arrayContaining([
        expect.objectContaining({ destination: "instagram" }),
      ]),
    );
    expect(mockedGetStoredPostDestinations).toHaveBeenCalledTimes(2);
  });

  it("delegates valid updates to the shared post service", async () => {
    mockedUpdatePost.mockResolvedValue(makePostRow() as never);
    mockedGetStoredPostDestinations.mockResolvedValue([instagramDestination] as never);

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        mediaComposition: null,
      }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mockedUpdatePost).toHaveBeenCalledWith(actor, "p1", {
      title: "Updated",
      mediaComposition: null,
    });
    await expect(res.json()).resolves.toMatchObject({
      title: "Updated",
      destinations: expect.arrayContaining([
        expect.objectContaining({ destination: "instagram" }),
      ]),
    });
  });

  it("rejects updates to posted posts", async () => {
    mockedUpdatePost.mockRejectedValue(
      new PostServiceError(
        "Posted posts are locked. Duplicate the post to make changes.",
      ),
    );

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Changed" }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Posted posts are locked. Duplicate the post to make changes.",
    });
  });

  it("rejects deleting posted posts", async () => {
    mockedDeletePost.mockRejectedValue(
      new PostServiceError(
        "Posted posts cannot be deleted. Archive the post instead.",
      ),
    );

    const req = new Request("https://app.example.com/api/posts/p1", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(409);
    expect(mockedDeletePost).toHaveBeenCalledWith(actor, "p1");
    await expect(res.json()).resolves.toMatchObject({
      error: "Posted posts cannot be deleted. Archive the post instead.",
    });
  });
});
