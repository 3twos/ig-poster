import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/actors", () => ({
  resolveActorFromRequest: vi.fn(),
}));

vi.mock("@/services/posts", () => ({
  duplicatePost: vi.fn(),
}));

import { POST } from "@/app/api/v1/posts/[id]/duplicate/route";
import { resolveActorFromRequest } from "@/services/actors";
import { duplicatePost } from "@/services/posts";

const mockedResolveActor = vi.mocked(resolveActorFromRequest);
const mockedDuplicatePost = vi.mocked(duplicatePost);

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

describe("POST /api/v1/posts/:id/duplicate", () => {
  beforeEach(() => {
    mockedResolveActor.mockReset();
    mockedDuplicatePost.mockReset();
  });

  it("returns the duplicated post resource envelope", async () => {
    mockedResolveActor.mockResolvedValue(actor);
    mockedDuplicatePost.mockResolvedValue({
      id: "copy-1",
      ownerHash: "hash",
      title: "Launch Copy",
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
      new Request("https://app.example.com/api/v1/posts/post-1/duplicate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "post-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        post: { id: "copy-1", title: "Launch Copy", status: "draft" },
      },
    });
  });
});
