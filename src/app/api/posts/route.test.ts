import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  createPost: vi.fn(),
  listPosts: vi.fn(),
}));

import { POST } from "@/app/api/posts/route";
import { resolveActorFromRequest } from "@/services/actors";
import { createPost } from "@/services/posts";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedCreatePost = vi.mocked(createPost);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
  authSource: "cookie",
} as never;

describe("POST /api/posts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
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

  it("delegates post creation to the shared post service", async () => {
    mockedCreatePost.mockResolvedValue({
      id: "post_1",
      title: "Launch day",
      status: "draft",
    } as never);

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
    await expect(res.json()).resolves.toMatchObject({
      id: "post_1",
      post: {
        id: "post_1",
        title: "Launch day",
      },
    });
  });
});
