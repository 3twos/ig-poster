import { describe, expect, it } from "vitest";

import {
  GenerationRequestSchema,
  buildPerformanceContext,
  coerceInternalGenerationResponse,
  normalizeOverlayLayout,
  selectTopVariants,
  selectTopVariantsWithScores,
  type CreativeVariant,
} from "@/lib/creative";

const makeVariant = (id: string, postType: CreativeVariant["postType"]): CreativeVariant => ({
  id,
  name: `Variant ${id}`,
  postType,
  hook: `Hook ${id} with a number 1`,
  headline: `Headline for ${id}`,
  supportingText: `Supporting text for ${id} with enough detail to satisfy schema constraints.`,
  cta: "Save this post",
  caption: "Save this practical framework for your next campaign and share with your team.",
  hashtags: [
    "#BrandPlaybook",
    "#InstagramGrowth",
    "#CreativeStrategy",
    "#ContentDesign",
    "#SocialMediaTips",
    "#MarketingOps",
  ],
  layout: "hero-quote",
  textAlign: "left",
  colorHexes: ["#0F172A", "#F97316", "#22C55E"],
  overlayStrength: 0.5,
  assetSequence: ["asset-1"],
});

const generationRequest = GenerationRequestSchema.parse({
  brand: {
    brandName: "Nexa Labs",
    website: "https://example.com",
    values: "Clarity, trust, execution",
    principles: "Show proof, keep copy concise, avoid fluff.",
    story: "Nexa Labs helps teams turn ideas into repeatable growth outcomes.",
    voice: "Confident, direct, practical",
    visualDirection: "Editorial layouts with strong contrast and clean hierarchy",
    palette: "#0F172A, #F97316, #22C55E",
    logoNotes: "Keep logo clear of headline overlays",
  },
  post: {
    theme: "Category authority",
    subject: "Trust by design",
    thought: "Trust is built through repeated proof moments users can feel.",
    objective: "Drive profile visits",
    audience: "Founders",
    mood: "Premium",
    aspectRatio: "4:5",
  },
  assets: [
    {
      id: "asset-1",
      name: "Hero",
      mediaType: "image",
      width: 1200,
      height: 1500,
    },
  ],
  hasLogo: true,
  promptConfig: {
    systemPrompt: "",
    customInstructions: "",
  },
});

describe("creative helpers", () => {
  it("coerces malformed internal payloads with deterministic fallback", () => {
    const { response, recovery } = coerceInternalGenerationResponse(
      {
        strategy: "short",
        variants: [{ id: "bad" }, { foo: "bar" }],
      },
      generationRequest,
    );

    expect(response.variants).toHaveLength(3);
    expect(response.strategy.length).toBeGreaterThanOrEqual(30);
    expect(recovery.droppedInvalidVariants).toBe(2);
    expect(recovery.usedFallbackVariants).toBeGreaterThan(0);
    expect(recovery.strategyFallbackUsed).toBe(true);
  });

  it("selects top variants while preserving post type diversity", () => {
    const variants: CreativeVariant[] = [
      makeVariant("a", "single-image"),
      makeVariant("b", "carousel"),
      makeVariant("c", "reel"),
      makeVariant("d", "single-image"),
    ];

    const picked = selectTopVariants(variants, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((v) => v.postType)).size).toBe(3);
  });

  it("applies model scores when selecting top variants", () => {
    const variants: CreativeVariant[] = [
      makeVariant("a", "single-image"),
      makeVariant("b", "carousel"),
      makeVariant("c", "reel"),
    ];

    const picked = selectTopVariantsWithScores(
      variants,
      [
        { id: "a", score: 4, rationale: "okay" },
        { id: "b", score: 9, rationale: "strong" },
        { id: "c", score: 8, rationale: "good" },
      ],
      2,
    );

    expect(picked).toHaveLength(2);
    expect(picked[0]?.id).toBe("b");
    expect(picked[0]?.score).toBe(9);
    expect(picked[0]?.scoreRationale).toBe("strong");
  });

  it("builds a ranked performance context string from insights", () => {
    const context = buildPerformanceContext([
      {
        id: "1",
        publishedAt: new Date().toISOString(),
        publishId: "media1",
        postType: "single-image",
        caption: "Caption",
        hook: "Hook one",
        hashtags: ["#One"],
        variantName: "A",
        brandName: "Brand",
        insights: {
          impressions: 1000,
          reach: 500,
          likes: 50,
          comments: 10,
          saves: 20,
          shares: 10,
          fetchedAt: new Date().toISOString(),
        },
      },
    ]);

    expect(context).toContain("Performance insights");
    expect(context).toContain("Hook one");
    expect(context).toContain("Engagement");
  });

  it("normalizes older overlay layouts with editor defaults", () => {
    const normalized = normalizeOverlayLayout("hero-quote", {
      headline: { x: 12, y: 20, width: 60, height: 18, fontScale: 1.2 },
    });

    expect(normalized.headline.x).toBe(12);
    expect(normalized.headline.visible).toBe(true);
    expect(normalized.headline.text).toBe("");
    expect(normalized.custom).toEqual([]);
    expect(normalized.hook.visible).toBe(true);
  });
});
