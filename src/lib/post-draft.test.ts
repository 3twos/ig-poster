import { describe, expect, it } from "vitest";

import type { PostDraft } from "@/hooks/use-post-reducer";
import { PostUpdateRequestSchema } from "@/lib/post-schemas";
import { buildPostUpdateRequest, serializePostDraft } from "@/lib/post-draft";

const baseDraft: PostDraft = {
  id: "post-1",
  title: "Draft title",
  status: "draft",
  archivedAt: null,
  brand: { brandName: "Example Brand" },
  brief: { subject: "Launch post", theme: "Product launch" },
  assets: [],
  logoUrl: null,
  brandKitId: null,
  promptConfig: { systemPrompt: "", customInstructions: "" },
  result: null,
  activeVariantId: null,
  overlayLayouts: {},
  mediaComposition: {
    orientation: "portrait",
    items: [
      {
        assetId: "asset-1",
        userTags: [
          { username: " @friend ", x: 0.25, y: 0.75 },
          { username: "", x: 0.5, y: 0.5 },
        ],
      },
    ],
  },
  publishSettings: {
    caption: "",
    firstComment: "",
    locationId: "",
    reelShareToFeed: true,
  },
  renderedPosterUrl: null,
  shareUrl: null,
  shareProjectId: null,
  publishHistory: [],
  destinations: [],
  activeSlideIndex: 2,
};

describe("post draft serialization", () => {
  it("builds a valid update payload from live draft state", () => {
    const payload = buildPostUpdateRequest(baseDraft);

    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("archivedAt");
    expect(payload).not.toHaveProperty("destinations");
    expect(payload).not.toHaveProperty("activeSlideIndex");
    expect(payload.mediaComposition?.items[0]?.userTags).toEqual([
      { username: "friend", x: 0.25, y: 0.75 },
    ]);
    expect(() => PostUpdateRequestSchema.parse(payload)).not.toThrow();
  });

  it("omits userTags when normalization removes every placeholder row", () => {
    const payload = buildPostUpdateRequest({
      ...baseDraft,
      mediaComposition: {
        orientation: "portrait",
        items: [
          {
            assetId: "asset-1",
            userTags: [{ username: "   ", x: 0.5, y: 0.5 }],
          },
        ],
      },
    });

    expect(payload.mediaComposition?.items[0]).not.toHaveProperty("userTags");
    expect(() => PostUpdateRequestSchema.parse(payload)).not.toThrow();
  });

  it("serializes the same sanitized payload used by autosave", () => {
    expect(JSON.parse(serializePostDraft(baseDraft))).toEqual(
      buildPostUpdateRequest(baseDraft),
    );
  });
});
