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

  it("includes all 17 API-accepted fields", () => {
    const payload = buildPostUpdateRequest(baseDraft);
    const keys = Object.keys(payload);
    expect(keys).toContain("title");
    expect(keys).toContain("status");
    expect(keys).toContain("logoUrl");
    expect(keys).toContain("activeVariantId");
    expect(keys).toContain("renderedPosterUrl");
    expect(keys).toContain("shareUrl");
    expect(keys).toContain("shareProjectId");
    expect(keys).toContain("brandKitId");
    expect(keys).toContain("brand");
    expect(keys).toContain("brief");
    expect(keys).toContain("promptConfig");
    expect(keys).toContain("overlayLayouts");
    expect(keys).toContain("mediaComposition");
    expect(keys).toContain("publishSettings");
    expect(keys).toContain("assets");
    expect(keys).toContain("result");
    expect(keys).toContain("publishHistory");
    expect(keys).toHaveLength(17);
  });

  it("normalizes user tag usernames (strips @, trims)", () => {
    const draft: PostDraft = {
      ...baseDraft,
      mediaComposition: {
        orientation: "portrait",
        items: [
          {
            assetId: "a1",
            userTags: [
              { username: "@johndoe", x: 0.5, y: 0.5 },
              { username: "  janedoe  ", x: 0.1, y: 0.2 },
            ],
          },
        ],
      },
    };
    const payload = buildPostUpdateRequest(draft);
    const tags = payload.mediaComposition!.items[0].userTags!;
    expect(tags[0].username).toBe("johndoe");
    expect(tags[1].username).toBe("janedoe");
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

  it("drops empty usernames after normalization", () => {
    const draft: PostDraft = {
      ...baseDraft,
      mediaComposition: {
        orientation: "portrait",
        items: [
          {
            assetId: "a1",
            userTags: [
              { username: "@", x: 0.5, y: 0.5 },
              { username: "   ", x: 0.1, y: 0.2 },
              { username: "valid_user", x: 0.3, y: 0.4 },
            ],
          },
        ],
      },
    };
    const payload = buildPostUpdateRequest(draft);
    const tags = payload.mediaComposition!.items[0].userTags!;
    expect(tags).toHaveLength(1);
    expect(tags[0].username).toBe("valid_user");
  });

  it("omits userTags key when original array is empty", () => {
    const draft: PostDraft = {
      ...baseDraft,
      mediaComposition: {
        orientation: "portrait",
        items: [{ assetId: "a1", userTags: [] }],
      },
    };
    const payload = buildPostUpdateRequest(draft);
    expect(payload.mediaComposition!.items[0]).not.toHaveProperty("userTags");
  });

  it("serializes the same sanitized payload used by autosave", () => {
    expect(JSON.parse(serializePostDraft(baseDraft))).toEqual(
      buildPostUpdateRequest(baseDraft),
    );
  });

  it("passes validation when result has user-edited short text (below generation minimums)", () => {
    const draft: PostDraft = {
      ...baseDraft,
      result: {
        strategy: "Short",
        variants: [
          {
            id: "v1",
            name: "V1",
            postType: "single-image",
            hook: "Hi",
            headline: "Hey",
            supportingText: "Brief",
            cta: "",
            caption: "Short caption",
            hashtags: ["#a"],
            layout: "hero-quote",
            textAlign: "left",
            colorHexes: ["#FF0000", "#00FF00"],
            overlayStrength: 0.5,
            assetSequence: ["asset-1"],
          },
        ],
      },
    };
    const payload = buildPostUpdateRequest(draft);
    expect(() => PostUpdateRequestSchema.parse(payload)).not.toThrow();
  });

  it("passes validation when overlay blocks have small dimensions from canvas resize", () => {
    const draft: PostDraft = {
      ...baseDraft,
      overlayLayouts: {
        "v1": {
          hook: { x: 0, y: 0, width: 2, height: 1, fontScale: 0.3, visible: true, text: "" },
          headline: { x: 50, y: 50, width: 100, height: 100, fontScale: 2.4, visible: true, text: "" },
          supportingText: { x: 0, y: 80, width: 60, height: 10, fontScale: 1.0, visible: false, text: "" },
          cta: { x: 0, y: 90, width: 40, height: 8, fontScale: 1.0, visible: true, text: "" },
          custom: [],
        },
      },
    };
    const payload = buildPostUpdateRequest(draft);
    expect(() => PostUpdateRequestSchema.parse(payload)).not.toThrow();
  });

  it("passes validation with empty hashtags and short color codes", () => {
    const draft: PostDraft = {
      ...baseDraft,
      result: {
        strategy: "Test strategy",
        variants: [
          {
            id: "v1",
            name: "V1",
            postType: "single-image",
            hook: "",
            headline: "",
            supportingText: "",
            cta: "",
            caption: "",
            hashtags: [],
            layout: "hero-quote",
            textAlign: "left",
            colorHexes: ["#fff", "#000"],
            overlayStrength: 0.0,
            assetSequence: ["asset-1"],
          },
        ],
      },
    };
    const payload = buildPostUpdateRequest(draft);
    expect(() => PostUpdateRequestSchema.parse(payload)).not.toThrow();
  });
});
