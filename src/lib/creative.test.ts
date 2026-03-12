import { describe, expect, it } from "vitest";

import {
  GenerationRequestSchema,
  applyLayoutCopyBudget,
  buildRefineUserPrompt,
  createFittedOverlayLayout,
  buildPerformanceContext,
  coerceInternalGenerationResponse,
  createDefaultOverlayLayout,
  fitOverlayLayoutToCopy,
  normalizeOverlayLayout,
  resolveVariantOverlayCopy,
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

  it("applies brand defaults to blocks but keeps CTA transparent", () => {
    const layout = createDefaultOverlayLayout("hero-quote", {
      cornerRadius: 16,
      bgOpacity: 50,
    });

    // Non-CTA blocks get both cornerRadius and bgOpacity
    expect(layout.hook.borderRadius).toBe(16);
    expect(layout.hook.bgOpacity).toBe(50);
    expect(layout.headline.borderRadius).toBe(16);
    expect(layout.headline.bgOpacity).toBe(50);
    expect(layout.supportingText.borderRadius).toBe(16);
    expect(layout.supportingText.bgOpacity).toBe(50);

    // CTA gets cornerRadius but NOT bgOpacity (stays transparent)
    expect(layout.cta.borderRadius).toBe(16);
    expect(layout.cta.bgOpacity).toBeUndefined();
  });

  it("keeps built-in overlay defaults inside the frame", () => {
    const layouts = [
      createDefaultOverlayLayout("hero-quote"),
      createDefaultOverlayLayout("split-story"),
      createDefaultOverlayLayout("magazine"),
      createDefaultOverlayLayout("minimal-logo"),
    ];

    for (const layout of layouts) {
      expect(layout.hook.y + layout.hook.height).toBeLessThanOrEqual(100);
      expect(layout.headline.y + layout.headline.height).toBeLessThanOrEqual(100);
      expect(layout.supportingText.y + layout.supportingText.height).toBeLessThanOrEqual(100);
      expect(layout.cta.y + layout.cta.height).toBeLessThanOrEqual(100);
    }
  });

  it("normalizes older overlay layouts with editor defaults", () => {
    const normalized = normalizeOverlayLayout("hero-quote", {
      headline: {
        x: 12,
        y: 20,
        width: 60,
        height: 18,
        fontScale: 1.2,
        visible: true,
        text: "",
      },
    });

    expect(normalized.headline.x).toBe(12);
    expect(normalized.headline.visible).toBe(true);
    expect(normalized.headline.text).toBe("");
    expect(normalized.custom).toEqual([]);
    expect(normalized.hook.visible).toBe(true);
  });

  it("normalizes custom overlay ids and defaults", () => {
    const normalized = normalizeOverlayLayout("hero-quote", {
      custom: [
        {
          id: "   ",
          label: " Custom Label ",
          text: "Custom text",
          x: 10,
          y: 12,
          width: 40,
          height: 10,
          fontScale: 1,
          visible: true,
        },
      ],
    });

    expect(normalized.custom).toHaveLength(1);
    expect(normalized.custom[0]?.id).toBe("custom-1");
    expect(normalized.custom[0]?.label).toBe(" Custom Label ");
  });

  it("clips overlay copy to layout-aware budgets", () => {
    const fitted = applyLayoutCopyBudget({
      ...makeVariant("layout-fit", "single-image"),
      layout: "magazine",
      hook: "A very long hook that should be shortened because magazine layouts have tighter space for hook copy",
      headline:
        "A very long headline that should be shortened for a compact editorial layout without destroying the meaning",
      supportingText:
        "This supporting text is intentionally far too long for the compact magazine layout and should be trimmed to a shorter, cleaner version that is more likely to fit without colliding with the rest of the overlay blocks.",
      cta: "Visit the profile to learn more about the full framework and process",
    });

    expect(fitted.hook.length).toBeLessThanOrEqual(34);
    expect(fitted.headline.length).toBeLessThanOrEqual(42);
    expect(fitted.supportingText.length).toBeLessThanOrEqual(82);
    expect(fitted.cta.length).toBeLessThanOrEqual(20);
  });

  it("builds refine prompts with brief and layout context", () => {
    const prompt = buildRefineUserPrompt({
      variant: makeVariant("refine", "single-image"),
      instruction: "Use shorter text in components and avoid CTA",
      brand: generationRequest.brand,
      post: generationRequest.post,
      promptConfig: {
        customInstructions: "Keep it editorial.",
      },
      overlayLayout: createDefaultOverlayLayout("hero-quote"),
    });

    expect(prompt).toContain("Original post brief:");
    expect(prompt).toContain("Current overlay layout JSON:");
    expect(prompt).toContain('set "cta" to an empty string');
    expect(prompt).toContain("Layout-fit priorities");
  });

  it("creates fitted layouts that stack canonical blocks without overlap", () => {
    const fitted = createFittedOverlayLayout(
      {
        ...makeVariant("fitted", "single-image"),
        layout: "magazine",
        hook: "Why strong positioning gets ignored",
        headline:
          "The headline is intentionally long enough to force a taller estimated block in the magazine layout",
        supportingText:
          "This supporting text is intentionally verbose so the fitter has to assign a taller box and still keep the stack inside the canvas without collisions between the headline, body, and CTA blocks.",
        cta: "Visit profile",
      },
      "4:5",
    );

    expect(fitted.hook.y + fitted.hook.height).toBeLessThanOrEqual(
      fitted.headline.y,
    );
    expect(fitted.headline.y + fitted.headline.height).toBeLessThanOrEqual(
      fitted.supportingText.y,
    );
    expect(
      fitted.supportingText.y + fitted.supportingText.height,
    ).toBeLessThanOrEqual(fitted.cta.y);
    expect(fitted.cta.y + fitted.cta.height).toBeLessThanOrEqual(100);
  });

  it("auto-fits an existing layout using current copy and preserves x positions", () => {
    const base = createDefaultOverlayLayout("hero-quote");
    base.headline.x = 14;

    const fitted = fitOverlayLayoutToCopy(
      {
        layout: "hero-quote",
        hook: "A practical hook",
        headline:
          "A deliberately longer headline that should get a taller block without moving horizontally",
        supportingText:
          "A supporting paragraph with enough length to require a slightly taller body box after fitting.",
        cta: "",
      },
      "4:5",
      base,
    );

    expect(fitted.headline.x).toBe(14);
    expect(fitted.headline.height).toBeGreaterThanOrEqual(base.headline.height);
    expect(fitted.supportingText.y).toBeGreaterThanOrEqual(
      fitted.headline.y + fitted.headline.height,
    );
  });

  it("clamps auto-fit blocks to valid sizes and safe stack bounds", () => {
    const fitted = fitOverlayLayoutToCopy(
      {
        layout: "magazine",
        hook: "This hook keeps the fitter active.",
        headline:
          "This headline is intentionally oversized to force the fitter to use the full safe stack rather than drifting above it.",
        supportingText: "Long body ".repeat(700),
        cta: "Learn more",
      },
      "4:5",
    );

    expect(fitted.hook.y).toBeGreaterThanOrEqual(66);
    expect(fitted.hook.height).toBeLessThanOrEqual(100);
    expect(fitted.headline.height).toBeLessThanOrEqual(100);
    expect(fitted.supportingText.height).toBeLessThanOrEqual(100);
    expect(fitted.cta.height).toBeLessThanOrEqual(100);
  });

  it("resolves overlay copy from the active carousel slide", () => {
    const carouselVariant: CreativeVariant = {
      ...makeVariant("carousel-fit", "carousel"),
      assetSequence: ["asset-1", "asset-2", "asset-3"],
      carouselSlides: [
        {
          index: 1,
          goal: "Open with tension",
          headline: "Slide one headline",
          body: "Slide one body with enough detail to satisfy the schema.",
          assetHint: "Cover",
        },
        {
          index: 2,
          goal: "Show the proof",
          headline: "Slide two headline",
          body: "Slide two body with enough detail to satisfy the schema.",
          assetHint: "Proof",
        },
        {
          index: 3,
          goal: "Close the loop",
          headline: "Slide three headline",
          body: "Slide three body with enough detail to satisfy the schema.",
          assetHint: "Finish",
        },
      ],
      cta: "Visit profile",
    };

    expect(resolveVariantOverlayCopy(carouselVariant, 0)).toMatchObject({
      hook: carouselVariant.hook,
      headline: carouselVariant.headline,
      supportingText: carouselVariant.supportingText,
      cta: carouselVariant.cta,
    });
    expect(resolveVariantOverlayCopy(carouselVariant, 1)).toMatchObject({
      hook: "Show the proof",
      headline: "Slide two headline",
      supportingText: "Slide two body with enough detail to satisfy the schema.",
      cta: "Swipe for more",
    });
    expect(resolveVariantOverlayCopy(carouselVariant, 99)).toMatchObject({
      hook: "Close the loop",
      headline: "Slide three headline",
      supportingText: "Slide three body with enough detail to satisfy the schema.",
      cta: "Visit profile",
    });
  });
});
