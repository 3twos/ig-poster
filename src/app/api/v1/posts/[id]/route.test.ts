import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  getPost: vi.fn(),
  updatePost: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  getStoredPostDestinations: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/v1/posts/[id]/route";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { getPost, updatePost } from "@/services/posts";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedGetPost = vi.mocked(getPost);
const mockedUpdatePost = vi.mocked(updatePost);
const mockedGetStoredPostDestinations = vi.mocked(getStoredPostDestinations);

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

describe("GET /api/v1/posts/:id", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedGetPost.mockReset();
    mockedUpdatePost.mockReset();
    mockedGetStoredPostDestinations.mockReset();
    mockedGetStoredPostDestinations.mockResolvedValue([]);
  });

  it("returns 404 when the post is missing", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedGetPost.mockResolvedValue(null as never);

    const response = await GET(
      new Request("https://app.example.com/api/v1/posts/post-1"),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns the post resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedGetPost.mockResolvedValue({
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

    const response = await GET(
      new Request("https://app.example.com/api/v1/posts/post-1"),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(200);
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

describe("PATCH /api/v1/posts/:id", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedGetPost.mockReset();
    mockedUpdatePost.mockReset();
    mockedGetStoredPostDestinations.mockReset();
    mockedGetStoredPostDestinations.mockResolvedValue([]);
  });

  it("returns 400 for invalid request bodies", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePost.mockRejectedValue(
      new z.ZodError([
        {
          code: "custom",
          path: ["status"],
          message: "bad",
        },
      ]),
    );

    const response = await PATCH(
      new Request("https://app.example.com/api/v1/posts/post-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "broken-status" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("returns the updated post resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedUpdatePost.mockResolvedValue({
      id: "post-1",
      ownerHash: "hash",
      title: "Updated",
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

    const response = await PATCH(
      new Request("https://app.example.com/api/v1/posts/post-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockedGetStoredPostDestinations).toHaveBeenCalledWith("post-1");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        post: {
          id: "post-1",
          title: "Updated",
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
