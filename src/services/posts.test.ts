import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/services/post-destinations", () => ({
  clonePostDestinations: vi.fn(),
  createDefaultPostDestinations: vi.fn(),
  deletePostDestinations: vi.fn(),
}));

import { getDb } from "@/db";
import type { GenerationResponse } from "@/lib/creative";
import {
  clonePostDestinations,
  createDefaultPostDestinations,
  deletePostDestinations,
} from "@/services/post-destinations";
import {
  createPost,
  deletePost,
  duplicatePost,
  PostServiceError,
  updatePost,
} from "@/services/posts";

const mockedGetDb = vi.mocked(getDb);
const mockedCreateDefaultPostDestinations = vi.mocked(createDefaultPostDestinations);
const mockedClonePostDestinations = vi.mocked(clonePostDestinations);
const mockedDeletePostDestinations = vi.mocked(deletePostDestinations);

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

describe("post services", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedCreateDefaultPostDestinations.mockReset();
    mockedClonePostDestinations.mockReset();
    mockedDeletePostDestinations.mockReset();
  });

  describe("updatePost", () => {
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

  describe("createPost", () => {
    it("seeds default destination rows when creating a post", async () => {
      const createdPost = {
        id: "post_1",
        ownerHash: "hash",
        title: "Fresh post",
        status: "draft",
        publishSettings: {
          caption: "Caption",
          firstComment: "First comment",
          locationId: "123",
          reelShareToFeed: true,
        },
      };
      const insertReturning = vi.fn().mockResolvedValue([createdPost]);
      const tx = {
        insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: insertReturning })) })),
      };
      const transaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
        callback(tx),
      );

      mockedGetDb.mockReturnValue({
        transaction,
      } as unknown as ReturnType<typeof getDb>);

      const result = await createPost(actor, {
        title: "Fresh post",
        brandKitId: "kit_1",
        publishSettings: createdPost.publishSettings,
      });

      expect(result).toEqual(createdPost);
      expect(mockedCreateDefaultPostDestinations).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          id: expect.any(String),
          publishSettings: createdPost.publishSettings,
        }),
      );
    });
  });

  describe("duplicatePost", () => {
    it("clones destination rows when duplicating a post", async () => {
      const existing = {
        id: "post_1",
        ownerHash: "hash",
        title: "Original",
        brand: null,
        brief: { subject: "Original" },
        assets: [],
        logoUrl: null,
        brandKitId: "kit_1",
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
      };
      const duplicatedPost = {
        ...existing,
        id: "copy_1",
        title: "Original Copy",
        status: "draft",
        renderedPosterUrl: null,
        shareUrl: null,
        shareProjectId: null,
        publishHistory: [],
        archivedAt: null,
        publishedAt: null,
      };
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existing]),
      };
      const insertReturning = vi.fn().mockResolvedValue([duplicatedPost]);
      const tx = {
        select: vi.fn(() => selectChain),
        insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: insertReturning })) })),
      };
      const transaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
        callback(tx),
      );

      mockedGetDb.mockReturnValue({
        transaction,
      } as unknown as ReturnType<typeof getDb>);

      const result = await duplicatePost(actor, "post_1");

      expect(result).toEqual(duplicatedPost);
      expect(mockedClonePostDestinations).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          id: "post_1",
          publishSettings: existing.publishSettings,
        }),
        expect.objectContaining({
          id: expect.any(String),
          publishSettings: duplicatedPost.publishSettings,
        }),
      );
    });
  });

  describe("deletePost", () => {
    it("deletes destination rows before removing a post", async () => {
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ status: "draft" as const }]),
      };
      const deleteWhere = vi.fn().mockResolvedValue(undefined);
      const tx = {
        select: vi.fn(() => selectChain),
        delete: vi.fn(() => ({ where: deleteWhere })),
      };
      const transaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
        callback(tx),
      );

      mockedGetDb.mockReturnValue({
        transaction,
      } as unknown as ReturnType<typeof getDb>);

      await expect(deletePost(actor, "post_1")).resolves.toBe(true);
      expect(mockedDeletePostDestinations).toHaveBeenCalledWith(tx, "post_1");
      expect(deleteWhere).toHaveBeenCalledTimes(1);
    });

    it("rejects deleting a posted post", async () => {
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ status: "posted" as const }]),
      };
      const tx = {
        select: vi.fn(() => selectChain),
        delete: vi.fn(),
      };
      const transaction = vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
        callback(tx),
      );

      mockedGetDb.mockReturnValue({
        transaction,
      } as unknown as ReturnType<typeof getDb>);

      await expect(deletePost(actor, "post_1")).rejects.toMatchObject({
        name: "PostServiceError",
        message: "Posted posts cannot be deleted. Archive the post instead.",
      } satisfies Partial<PostServiceError>);
      expect(mockedDeletePostDestinations).not.toHaveBeenCalled();
    });
  });
});
