import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/workspace-auth", () => ({
  readWorkspaceSessionFromRequest: vi.fn(),
}));

import { POST } from "@/app/api/posts/[id]/duplicate/route";
import { getDb } from "@/db";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

const mockedGetDb = vi.mocked(getDb);
const mockedReadWorkspace = vi.mocked(readWorkspaceSessionFromRequest);

const session = {
  sub: "user-1",
  email: "person@example.com",
  domain: "example.com",
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("POST /api/posts/:id/duplicate", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedReadWorkspace.mockReset();
  });

  it("returns 401 when the workspace session is missing", async () => {
    mockedReadWorkspace.mockResolvedValue(null);

    const req = new Request("https://app.example.com/api/posts/p1/duplicate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(401);
  });

  it("duplicates the post into a fresh draft copy", async () => {
    mockedReadWorkspace.mockResolvedValue(session);

    const existing = {
      id: "p1",
      ownerHash: "owner",
      title: "Original title",
      status: "posted",
      brand: { brandName: "Acme" },
      brief: { subject: "Original title" },
      assets: [{ id: "asset-1", name: "asset", url: "https://cdn.example.com/1.jpg" }],
      logoUrl: "https://cdn.example.com/logo.png",
      brandKitId: "kit_1",
      promptConfig: { systemPrompt: "Prompt" },
      result: { variants: [{ id: "variant-1" }] },
      activeVariantId: "variant-1",
      overlayLayouts: { "variant-1": { headline: { text: "Headline" } } },
      mediaComposition: {
        orientation: "portrait",
        items: [{ assetId: "asset-1", excludedFromPost: false }],
      },
      publishSettings: {
        caption: "Saved caption",
        firstComment: "First comment",
        locationId: "123",
        reelShareToFeed: true,
      },
      renderedPosterUrl: "https://cdn.example.com/poster.png",
      shareUrl: "https://share.example.com/p1",
      shareProjectId: "share_1",
      publishHistory: [{ publishedAt: "2026-03-01T12:00:00.000Z" }],
      archivedAt: null,
      publishedAt: new Date("2026-03-01T12:00:00.000Z"),
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      updatedAt: new Date("2026-03-01T11:00:00.000Z"),
    };

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
    };
    const returning = vi.fn().mockResolvedValue([
      {
        ...existing,
        id: "copy_1",
        title: "Original title Copy",
        status: "draft",
        shareUrl: null,
        shareProjectId: null,
        publishHistory: [],
        publishedAt: null,
        archivedAt: null,
      },
    ]);
    const insertValues = vi.fn().mockReturnValue({ returning });

    mockedGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    } as unknown as ReturnType<typeof getDb>);

    const req = new Request("https://app.example.com/api/posts/p1/duplicate", {
      method: "POST",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "p1" }) });

    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        title: "Original title Copy",
        shareUrl: null,
        shareProjectId: null,
        publishHistory: [],
        publishSettings: existing.publishSettings,
        mediaComposition: existing.mediaComposition,
        renderedPosterUrl: null,
        archivedAt: null,
        publishedAt: null,
      }),
    );
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
