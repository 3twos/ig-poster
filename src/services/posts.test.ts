import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/db";
import type { GenerationResponse } from "@/lib/creative";
import { updatePost } from "@/services/posts";

const mockedGetDb = vi.mocked(getDb);

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

const validGenerationResult: GenerationResponse = {
  strategy:
    "This is a sufficiently long strategy string to satisfy the generation response schema.",
  variants: [
    {
      id: "variant-1",
      name: "Variant One",
      postType: "single-image",
      hook: "Strong hook line for the post",
      headline: "A clear headline for the first variant",
      supportingText: "Supporting text that is long enough to satisfy the schema for the creative variant.",
      cta: "Tap to learn more",
      caption:
        "This caption is comfortably long enough to satisfy the generation response schema requirements for testing purposes.",
      hashtags: ["#brand", "#launch", "#creative", "#social", "#campaign"],
      layout: "hero-quote",
      textAlign: "left",
      colorHexes: ["#112233", "#445566"],
      overlayStrength: 0.4,
      assetSequence: ["asset-1"],
    },
    {
      id: "variant-2",
      name: "Variant Two",
      postType: "single-image",
      hook: "Another strong hook for testing",
      headline: "A clear headline for the second variant",
      supportingText: "Supporting text that is long enough to satisfy the schema for the creative variant.",
      cta: "Tap to learn more",
      caption:
        "This caption is comfortably long enough to satisfy the generation response schema requirements for testing purposes.",
      hashtags: ["#brand", "#launch", "#creative", "#social", "#campaign"],
      layout: "split-story",
      textAlign: "left",
      colorHexes: ["#223344", "#556677"],
      overlayStrength: 0.45,
      assetSequence: ["asset-1"],
    },
    {
      id: "variant-3",
      name: "Variant Three",
      postType: "single-image",
      hook: "A third strong hook for testing",
      headline: "A clear headline for the third variant",
      supportingText: "Supporting text that is long enough to satisfy the schema for the creative variant.",
      cta: "Tap to learn more",
      caption:
        "This caption is comfortably long enough to satisfy the generation response schema requirements for testing purposes.",
      hashtags: ["#brand", "#launch", "#creative", "#social", "#campaign"],
      layout: "magazine",
      textAlign: "left",
      colorHexes: ["#334455", "#667788"],
      overlayStrength: 0.5,
      assetSequence: ["asset-1"],
    },
  ],
};

describe("updatePost", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
  });

  it("ignores null overlayLayouts updates so the db payload stays non-null", async () => {
    const existing = {
      id: "p1",
      ownerHash: "hash",
      title: "Original",
      mediaComposition: {
        orientation: "portrait",
        items: [{ assetId: "asset-1", excludedFromPost: false }],
      },
      overlayLayouts: { variant: { headline: { text: "Old" } } },
      brand: null,
      brief: null,
      promptConfig: null,
      publishSettings: null,
      status: "draft",
    };
    const selectLimit = vi.fn().mockResolvedValue([existing]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateReturning = vi.fn().mockResolvedValue([
      { ...existing, title: "Updated" },
    ]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return { where: updateWhere };
    });

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as ReturnType<typeof getDb>);

    await updatePost(actor, "p1", {
      title: "Updated",
      overlayLayouts: null,
    });

    expect(updateSet).toHaveBeenCalledTimes(1);
    const [updatePayload] = updateSet.mock.calls[0];
    expect(updatePayload).not.toHaveProperty("overlayLayouts");
  });

  it("preserves an explicit scheduled status when result is also provided", async () => {
    const existing = {
      id: "p1",
      ownerHash: "hash",
      title: "Original",
      mediaComposition: {
        orientation: "portrait",
        items: [{ assetId: "asset-1", excludedFromPost: false }],
      },
      overlayLayouts: {},
      brand: null,
      brief: null,
      promptConfig: null,
      publishSettings: null,
      status: "draft",
    };
    const selectLimit = vi.fn().mockResolvedValue([existing]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const updateReturning = vi.fn().mockResolvedValue([
      { ...existing, status: "scheduled" },
    ]);
    const updateWhere = vi.fn(() => ({ returning: updateReturning }));
    const updateSet = vi.fn((payload: Record<string, unknown>) => {
      void payload;
      return { where: updateWhere };
    });

    mockedGetDb.mockReturnValue({
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    } as unknown as ReturnType<typeof getDb>);

    await updatePost(actor, "p1", {
      status: "scheduled",
      result: validGenerationResult,
    });

    expect(updateSet).toHaveBeenCalledTimes(1);
    const [updatePayload] = updateSet.mock.calls[0];
    expect(updatePayload).toMatchObject({
      status: "scheduled",
    });
  });
});
