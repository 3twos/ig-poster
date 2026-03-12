import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  duplicatePost: vi.fn(),
}));

import { POST } from "@/app/api/posts/[id]/duplicate/route";
import { resolveActorFromRequest } from "@/services/actors";
import { duplicatePost } from "@/services/posts";

const mockedResolveActorFromRequest = vi.mocked(resolveActorFromRequest);
const mockedDuplicatePost = vi.mocked(duplicatePost);

const actor = {
  ownerHash: "owner_hash",
  email: "person@example.com",
  domain: "example.com",
  authSource: "cookie",
} as never;

describe("POST /api/posts/:id/duplicate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedResolveActorFromRequest.mockResolvedValue(actor);
  });

  it("returns 401 when auth is missing", async () => {
    mockedResolveActorFromRequest.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/posts/p1/duplicate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("duplicates the post into a fresh draft copy", async () => {
    mockedDuplicatePost.mockResolvedValue({
      id: "copy_1",
      title: "Original title Copy",
      status: "draft",
    } as never);

    const req = new Request("https://app.example.com/api/posts/p1/duplicate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(mockedDuplicatePost).toHaveBeenCalledWith(actor, "p1");
    await expect(res.json()).resolves.toMatchObject({
      id: "copy_1",
      post: {
        id: "copy_1",
        title: "Original title Copy",
        status: "draft",
      },
    });
  });
});
