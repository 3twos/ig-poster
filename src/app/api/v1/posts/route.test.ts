import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  listPosts: vi.fn(),
  createPost: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  getStoredPostDestinations: vi.fn(),
  listStoredPostDestinationsByPostId: vi.fn(),
}));

import { GET, POST } from "@/app/api/v1/posts/route";
import { resolveActorFromRequest } from "@/services/actors";
import {
  getStoredPostDestinations,
  listStoredPostDestinationsByPostId,
} from "@/services/post-destinations";
import { createPost, listPosts } from "@/services/posts";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedListPosts = vi.mocked(listPosts);
const mockedCreatePost = vi.mocked(createPost);
const mockedGetStoredPostDestinations = vi.mocked(getStoredPostDestinations);
const mockedListStoredPostDestinationsByPostId = vi.mocked(
  listStoredPostDestinationsByPostId,
);

const actor = {
  type: "workspace-user" as const,
  subjectId: "user-1",
  email: "person@example.com",
  domain: "example.com",
  ownerHash: "hash",
  authSource: "bearer" as const,
  scopes: ["posts:read", "posts:write"],
  issuedAt: "2026-03-08T10:00:00.000Z",
  expiresAt: "2026-03-08T11:00:00.000Z",
};

describe("GET /api/v1/posts", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedListPosts.mockReset();
    mockedCreatePost.mockReset();
    mockedGetStoredPostDestinations.mockReset();
    mockedListStoredPostDestinationsByPostId.mockReset();
    mockedListStoredPostDestinationsByPostId.mockResolvedValue(new Map());
  });

  it("returns 401 when the request is unauthenticated", async () => {
    mockedResolveActor.mockResolvedValue(null);

    const response = await GET(
      new Request("https://app.example.com/api/v1/posts"),
    );

    expect(response.status).toBe(401);
  });

  it("returns a versioned posts envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedListPosts.mockResolvedValue([
      {
        id: "post-1",
        ownerHash: "hash",
        title: "Launch",
        status: "draft",
        brief: null,
        result: null,
        assets: [],
        renderedPosterUrl: null,
        brandKitId: null,
        activeVariantId: null,
        shareUrl: null,
        mediaComposition: { orientation: "portrait", items: [] },
        publishSettings: null,
        publishHistory: [],
        logoUrl: null,
        promptConfig: null,
        createdAt: new Date("2026-03-08T10:00:00.000Z"),
        updatedAt: new Date("2026-03-08T10:00:00.000Z"),
        archivedAt: null,
        publishedAt: null,
        shareProjectId: null,
        overlayLayouts: {},
        brand: null,
      },
    ] as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/posts?status=draft"),
    );

    expect(response.status).toBe(200);
    expect(mockedListPosts).toHaveBeenCalledWith(actor, {
      archived: false,
      status: "draft",
    });
    expect(mockedListStoredPostDestinationsByPostId).toHaveBeenCalledWith(["post-1"]);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        posts: [
          {
            id: "post-1",
            title: "Launch",
            status: "draft",
            destinations: [
              {
                destination: "facebook",
                enabled: false,
              },
              {
                destination: "instagram",
                enabled: true,
              },
            ],
          },
        ],
      },
    });
  });
});

describe("POST /api/v1/posts", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedListPosts.mockReset();
    mockedCreatePost.mockReset();
    mockedGetStoredPostDestinations.mockReset();
    mockedListStoredPostDestinationsByPostId.mockReset();
    mockedGetStoredPostDestinations.mockResolvedValue([]);
  });

  it("returns 400 for invalid request bodies", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedCreatePost.mockRejectedValue(
      new z.ZodError([
        {
          code: "custom",
          path: ["title"],
          message: "bad",
        },
      ]),
    );

    const response = await POST(
      new Request("https://app.example.com/api/v1/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: 1 }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 201 with a post resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedCreatePost.mockResolvedValue({
      id: "post-1",
      ownerHash: "hash",
      title: "Launch",
      status: "draft",
      brief: null,
      result: null,
      assets: [],
      renderedPosterUrl: null,
      brandKitId: null,
      activeVariantId: null,
      shareUrl: null,
      mediaComposition: { orientation: "portrait", items: [] },
      publishSettings: null,
      publishHistory: [],
      logoUrl: null,
      promptConfig: null,
      createdAt: new Date("2026-03-08T10:00:00.000Z"),
      updatedAt: new Date("2026-03-08T10:00:00.000Z"),
      archivedAt: null,
      publishedAt: null,
      shareProjectId: null,
      overlayLayouts: {},
      brand: null,
    } as never);

    const response = await POST(
      new Request("https://app.example.com/api/v1/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Launch" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockedGetStoredPostDestinations).toHaveBeenCalledWith("post-1");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        post: {
          id: "post-1",
          title: "Launch",
          destinations: [
            {
              destination: "facebook",
              enabled: false,
            },
            {
              destination: "instagram",
              enabled: true,
            },
          ],
        },
      },
    });
  });
});
