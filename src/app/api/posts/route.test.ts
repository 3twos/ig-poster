import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  createPost: vi.fn(),
  listPosts: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  getStoredPostDestinations: vi.fn(),
  listStoredPostDestinationsByPostId: vi.fn(),
}));

import { GET, POST } from "@/app/api/posts/route";
import { resolveActorFromRequest } from "@/services/actors";
import {
  getStoredPostDestinations,
  listStoredPostDestinationsByPostId,
} from "@/services/post-destinations";
import { createPost, listPosts } from "@/services/posts";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedCreatePost = vi.mocked(createPost);
const mockedListPosts = vi.mocked(listPosts);
const mockedGetStoredPostDestinations = vi.mocked(getStoredPostDestinations);
const mockedListStoredPostDestinationsByPostId = vi.mocked(
  listStoredPostDestinationsByPostId,
);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
  authSource: "cookie",
} as never;

const instagramDestination = {
  id: "dest_1",
  postId: "post_1",
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
  id: "post_1",
  ownerHash: "owner_hash",
  title: "Launch day",
  status: "draft",
  brand: null,
  brief: null,
  assets: [],
  logoUrl: null,
  brandKitId: null,
  promptConfig: null,
  result: null,
  activeVariantId: null,
  overlayLayouts: {},
  mediaComposition: { orientation: "portrait", items: [] },
  publishSettings: {
    caption: "Caption",
    firstComment: "First comment",
    locationId: "123",
    reelShareToFeed: true,
  },
  renderedPosterUrl: null,
  shareUrl: null,
  shareProjectId: null,
  publishHistory: [],
  createdAt: new Date("2026-03-12T18:00:00.000Z"),
  updatedAt: new Date("2026-03-12T18:00:00.000Z"),
  archivedAt: null,
  publishedAt: null,
});

describe("POST /api/posts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
    mockedGetStoredPostDestinations.mockResolvedValue([]);
    mockedListStoredPostDestinationsByPostId.mockResolvedValue(new Map());
  });

  it("returns 401 when auth is missing", async () => {
    mockedResolveActorFromRequest.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid create payloads", async () => {
    const req = new Request("https://app.example.com/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "x".repeat(121),
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Invalid request body" });
  });

  it("includes destinations when listing posts", async () => {
    mockedListPosts.mockResolvedValue([makePostRow()] as never);
    mockedListStoredPostDestinationsByPostId.mockResolvedValue(
      new Map([["post_1", [instagramDestination]]]),
    );

    const req = new Request("https://app.example.com/api/posts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockedListStoredPostDestinationsByPostId).toHaveBeenCalledWith(["post_1"]);
    await expect(res.json()).resolves.toMatchObject({
      posts: [
        {
          id: "post_1",
          destinations: expect.arrayContaining([
            expect.objectContaining({ destination: "instagram" }),
          ]),
        },
      ],
    });
  });

  it("delegates post creation to the shared post service", async () => {
    mockedCreatePost.mockResolvedValue(makePostRow() as never);
    mockedGetStoredPostDestinations.mockResolvedValue([instagramDestination] as never);

    const req = new Request("https://app.example.com/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Launch day" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockedCreatePost).toHaveBeenCalledWith(actor, {
      title: "Launch day",
    });
    expect(mockedGetStoredPostDestinations).toHaveBeenCalledWith("post_1");
    await expect(res.json()).resolves.toMatchObject({
      id: "post_1",
      post: {
        id: "post_1",
        title: "Launch day",
        destinations: expect.arrayContaining([
          expect.objectContaining({ destination: "instagram" }),
        ]),
      },
    });
  });
});
