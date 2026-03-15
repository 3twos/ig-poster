import { describe, expect, it } from "vitest";

import {
  analyzeCanonicalOverlayLayout,
  applyRefinementPlan,
  GenerationRequestSchema,
  applyLayoutCopyBudget,
  buildGenerationUserPrompt,
  buildRefineUserPrompt,
  createFittedOverlayLayout,
  buildPerformanceContext,
  coerceInternalGenerationResponse,
  createFallbackResponse,
  createDefaultOverlayLayout,
  deriveRefinementPlan,
  fitOverlayLayoutToCopy,
  normalizeOverlayLayout,
  resolveVariantOverlayCopy,
  selectTopVariants,
  selectTopVariantsWithScores,
  StoredOverlayLayoutSchema,
  syncOverlayLayoutToVariantCopy,
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
    ctaPolicy: "support-objective",
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

  it("prefers brief-aligned variants over generic engagement tropes", () => {
    const generic = {
      ...makeVariant("generic", "single-image"),
      hook: "3 tips to grow faster",
      headline: "Save this content framework",
      supportingText:
        "Use this framework to boost engagement, shares, and reach with simple repeatable content moves.",
      cta: "Save this post",
      caption:
        "Save this and share it with your team if you want more engagement from your content next week.",
    };
    const aligned = {
      ...makeVariant("aligned", "single-image"),
      hook: "Trust by design starts with visible proof",
      headline: "Designing trust for founders",
      supportingText:
        "Trust is built through repeated proof moments users can feel. Founders need proof before they believe the promise.",
      cta: "Visit profile",
      caption:
        "Trust by design is not a slogan. It comes from repeated proof moments users can feel, especially for founders evaluating whether your product is credible enough to explore further. Visit the profile for the full point of view.",
    };

    const picked = selectTopVariants([generic, aligned], 1, {
      brand: generationRequest.brand,
      post: generationRequest.post,
    });

    expect(picked[0]?.id).toBe("aligned");
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

  it("uses brief alignment as a tie-break when model scores are equal", () => {
    const generic = {
      ...makeVariant("generic-score", "single-image"),
      hook: "3 tips to grow faster",
      headline: "Save this content framework",
      supportingText:
        "Use this framework to boost engagement, shares, and reach with simple repeatable content moves.",
      cta: "Save this post",
      caption:
        "Save this and share it with your team if you want more engagement from your content next week.",
    };
    const aligned = {
      ...makeVariant("aligned-score", "single-image"),
      hook: "Trust by design starts with visible proof",
      headline: "Designing trust for founders",
      supportingText:
        "Trust is built through repeated proof moments users can feel. Founders need proof before they believe the promise.",
      cta: "Visit profile",
      caption:
        "Trust by design is not a slogan. It comes from repeated proof moments users can feel, especially for founders evaluating whether your product is credible enough to explore further. Visit the profile for the full point of view.",
    };

    const picked = selectTopVariantsWithScores(
      [generic, aligned],
      [
        { id: "generic-score", score: 8, rationale: "solid" },
        { id: "aligned-score", score: 8, rationale: "solid" },
      ],
      1,
      {
        brand: generationRequest.brand,
        post: generationRequest.post,
      },
    );

    expect(picked[0]?.id).toBe("aligned-score");
  });

  it("does not treat partial-word overlaps as full brief alignment", () => {
    const partial = {
      ...makeVariant("partial-word", "single-image"),
      hook: "Career system design for skeptical teams",
      headline: "Career system proof",
      supportingText:
        "Career system design can create better process clarity, but that is not the same idea as a care system.",
      cta: "Visit profile",
      caption:
        "Career system language should not be treated as a full match for a care-system brief.",
    };
    const aligned = {
      ...makeVariant("whole-word", "single-image"),
      hook: "Care system design for skeptical teams",
      headline: "Care system proof",
      supportingText:
        "Care system design creates trust when the proof is easy to see and feel in the experience.",
      cta: "Visit profile",
      caption:
        "Care system language should win because it matches the brief exactly.",
    };

    const picked = selectTopVariants([partial, aligned], 1, {
      brand: generationRequest.brand,
      post: {
        ...generationRequest.post,
        subject: "Care system",
        thought: "Proof builds trust through visible product moments.",
      },
    });

    expect(picked[0]?.id).toBe("whole-word");
  });

  it("prefers CTA-free variants when the saved brief says to avoid CTA", () => {
    const withCta = {
      ...makeVariant("with-cta", "single-image"),
      hook: "Trust by design starts with visible proof",
      headline: "Designing trust for founders",
      supportingText:
        "Trust is built through repeated proof moments users can feel. Founders need proof before they believe the promise.",
      cta: "Visit profile",
      caption:
        "Trust by design is not a slogan. It comes from repeated proof moments users can feel.",
    };
    const noCta = {
      ...withCta,
      id: "no-cta",
      cta: "",
    };

    const picked = selectTopVariants([withCta, noCta], 1, {
      brand: generationRequest.brand,
      post: {
        ...generationRequest.post,
        ctaPolicy: "avoid",
      },
    });

    expect(picked[0]?.id).toBe("no-cta");
  });

  it("fills fallback CTAs when the saved brief requires one", () => {
    const fallback = createFallbackResponse({
      ...generationRequest,
      post: {
        ...generationRequest.post,
        ctaPolicy: "require",
        objective: "Drive demo bookings",
      },
    });

    expect(fallback.variants.every((variant) => variant.cta.trim().length > 0)).toBe(true);
  });

  it("removes fallback CTAs when the saved brief avoids them", () => {
    const fallback = createFallbackResponse({
      ...generationRequest,
      post: {
        ...generationRequest.post,
        ctaPolicy: "avoid",
      },
    });

    expect(fallback.variants.every((variant) => variant.cta === "")).toBe(true);
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
    expect(prompt).toContain("Parsed refinement plan");
    expect(prompt).toContain('"ctaAction": "remove"');
    expect(prompt).toContain('"preserveLayout": true');
    expect(prompt).toContain('set "cta" to an empty string');
    expect(prompt).toContain("CTA policy:");
    expect(prompt).toContain("Layout-fit priorities");
  });

  it("derives structured refinement plans from instructions", () => {
    const plan = deriveRefinementPlan(
      "Make the headline and body significantly shorter, keep this purely editorial, and tailor it for SaaS founders.",
      makeVariant("refine-plan", "single-image"),
    );

    expect(plan.shorten.hook).toBe(false);
    expect(plan.shorten.headline).toBe(true);
    expect(plan.shorten.supportingText).toBe(true);
    expect(plan.shorten.caption).toBe(false);
    expect(plan.shorten.intensity).toBe("aggressive");
    expect(plan.ctaAction).toBe("remove");
    expect(plan.toneDirection).toBe("editorial");
    expect(plan.audienceHint).toBe("saas founders");
    expect(plan.preserveLayout).toBe(true);
  });

  it("does not infer a direct-tone shift from generic clarity wording", () => {
    const plan = deriveRefinementPlan(
      "Make the headline clear and shorter.",
      makeVariant("clear-headline", "single-image"),
    );

    expect(plan.toneDirection).toBe("preserve");
    expect(plan.shorten.headline).toBe(true);
  });

  it("builds generation prompts with explicit brief precedence and CTA policy", () => {
    const prompt = buildGenerationUserPrompt(generationRequest, {
      websiteStyleContext: "Confident editorial layouts with motion-heavy cutaways.",
      websiteBodyText:
        "We help teams scale performance content with clearer systems and more reusable assets.",
      performanceContext:
        "Top performers led with proof-first hooks and concise captions aimed at profile visits.",
    });

    expect(prompt).toContain("Priority order for this task:");
    expect(prompt).toContain("Saved post brief and custom user instructions");
    expect(prompt).toContain(
      "Do not let website cues, best-practice tips, or reference examples override the saved brief.",
    );
    expect(prompt).toContain(
      "Supporting website-derived style cues (use only if they reinforce the saved brief):",
    );
    expect(prompt).toContain("CTA policy:");
    expect(prompt).toContain("CTA policy for this brief:");
    expect(prompt.match(/Supporting website-derived style cues/g)).toHaveLength(1);
    expect(prompt.match(/Supporting website body content/g)).toHaveLength(1);
    expect(prompt.match(/Supporting performance context/g)).toHaveLength(1);
  });

  it("applies the saved CTA policy during refine when the instruction does not override it", () => {
    const currentVariant: CreativeVariant = {
      ...makeVariant("cta-policy-refine", "single-image"),
      cta: "Visit profile",
    };

    const avoidCta = applyRefinementPlan({
      currentVariant,
      refinedVariant: currentVariant,
      instruction: "Make the supporting text more editorial.",
      post: {
        ctaPolicy: "avoid",
        objective: generationRequest.post.objective,
      },
    });

    const requireCta = applyRefinementPlan({
      currentVariant: {
        ...currentVariant,
        cta: "",
      },
      refinedVariant: {
        ...currentVariant,
        cta: "",
      },
      instruction: "Tighten the hook and body.",
      post: {
        ctaPolicy: "require",
        objective: "Drive demo bookings",
      },
    });

    expect(avoidCta.cta).toBe("");
    expect(requireCta.cta).toBe("Book a call");
  });

  it("lets an explicit add-CTA refine instruction override avoid-CTA policy", () => {
    const currentVariant: CreativeVariant = {
      ...makeVariant("cta-policy-override", "single-image"),
      cta: "",
    };

    const refined = applyRefinementPlan({
      currentVariant,
      refinedVariant: {
        ...currentVariant,
        cta: "",
      },
      instruction: "Add a short CTA and tighten the body copy.",
      post: {
        ctaPolicy: "avoid",
        objective: "Drive demo bookings",
      },
    });

    expect(refined.cta).toBe("Book a call");
  });

  it("enforces refine directives for shorter copy, shorter caption, and no CTA", () => {
    const currentVariant: CreativeVariant = {
      ...makeVariant("refine-enforced", "carousel"),
      layout: "magazine",
      hook:
        "A longer hook that should be tightened once refinement asks for shorter copy across the on-canvas components.",
      headline:
        "A headline that is intentionally verbose so the deterministic refine policy has to shorten it meaningfully.",
      supportingText:
        "This supporting text is intentionally wordy so the deterministic refinement pass has to trim the component copy while keeping the overall idea intact for the user.",
      cta: "Visit the profile to get the full breakdown",
      caption:
        "This caption is intentionally long and detailed so the deterministic refinement pass can make it significantly shorter while preserving the main message for the audience and keeping it coherent.",
      carouselSlides: [
        {
          index: 1,
          goal: "A long first-slide goal that should become shorter after refinement",
          headline: "A long first-slide headline that should also tighten up",
          body: "A long first-slide body that should become noticeably shorter after the refine instruction is enforced.",
          assetHint: "Cover",
        },
        {
          index: 2,
          goal: "A long second-slide goal that should become shorter after refinement",
          headline: "A long second-slide headline that should also tighten up",
          body: "A long second-slide body that should become noticeably shorter after the refine instruction is enforced.",
          assetHint: "Proof",
        },
        {
          index: 3,
          goal: "A long final-slide goal that should become shorter after refinement",
          headline: "A long final-slide headline that should also tighten up",
          body: "A long final-slide body that should become noticeably shorter after the refine instruction is enforced.",
          assetHint: "Finish",
        },
      ],
    };

    const refined = applyRefinementPlan({
      currentVariant,
      refinedVariant: {
        ...currentVariant,
        hook: `${currentVariant.hook} Extra copy that the model forgot to trim.`,
        headline: `${currentVariant.headline} Additional detail that should not survive.`,
        supportingText: `${currentVariant.supportingText} Additional explanation that should be shortened away by policy.`,
        cta: "Save, share, and visit the profile for the full breakdown",
        caption: `${currentVariant.caption} Extra closing lines that should be trimmed away when the caption is made much shorter.`,
        carouselSlides: currentVariant.carouselSlides?.map((slide) => ({
          ...slide,
          body: `${slide.body} More slide copy that should be shortened.`,
        })),
      },
      instruction:
        "Use shorter text in components, make the caption significantly shorter, and avoid CTA.",
    });

    expect(refined.cta).toBe("");
    expect(refined.hook.length).toBeLessThan(currentVariant.hook.length);
    expect(refined.headline.length).toBeLessThan(currentVariant.headline.length);
    expect(refined.supportingText.length).toBeLessThan(
      currentVariant.supportingText.length,
    );
    expect(refined.caption.length).toBeLessThan(currentVariant.caption.length);
    expect(refined.carouselSlides?.[1]?.body.length).toBeLessThan(
      currentVariant.carouselSlides?.[1]?.body.length ?? Infinity,
    );
  });

  it("keeps overlay copy intact for caption-only shortening instructions", () => {
    const currentVariant: CreativeVariant = {
      ...makeVariant("caption-only", "single-image"),
      caption:
        "This caption is intentionally long so the deterministic refine pass can shorten it when the user asks for a tighter caption while keeping the on-canvas copy stable.",
      cta: "Visit profile",
    };

    const refined = applyRefinementPlan({
      currentVariant,
      refinedVariant: {
        ...currentVariant,
        caption: `${currentVariant.caption} Extra detail that should be trimmed away.`,
      },
      instruction: "Make the caption shorter and remove CTA.",
    });

    expect(refined.hook).toBe(currentVariant.hook);
    expect(refined.headline).toBe(currentVariant.headline);
    expect(refined.supportingText).toBe(currentVariant.supportingText);
    expect(refined.caption.length).toBeLessThan(currentVariant.caption.length);
    expect(refined.cta).toBe("");
  });

  it("shortens only the requested overlay fields", () => {
    const currentVariant: CreativeVariant = {
      ...makeVariant("field-specific", "single-image"),
      hook: "Hook stays untouched here",
      headline:
        "A headline that should be the main shortening target for this field-specific refine instruction.",
      supportingText:
        "This supporting text is intentionally verbose so the deterministic refine plan has obvious work to do on the body field only.",
      caption:
        "Caption should stay unchanged because the user only asked to tighten the headline and body.",
    };

    const refined = applyRefinementPlan({
      currentVariant,
      refinedVariant: {
        ...currentVariant,
        hook: `${currentVariant.hook} More detail.`,
        headline: `${currentVariant.headline} Extra headline detail that should be cut.`,
        supportingText: `${currentVariant.supportingText} Extra body detail that should be cut.`,
        caption: `${currentVariant.caption} Extra caption detail that should survive.`,
      },
      instruction: "Make the headline and body much shorter.",
    });

    expect(refined.hook).toBe(
      `${currentVariant.hook} More detail.`,
    );
    expect(refined.headline.length).toBeLessThan(currentVariant.headline.length);
    expect(refined.supportingText.length).toBeLessThan(
      currentVariant.supportingText.length,
    );
    expect(refined.caption).toBe(
      `${currentVariant.caption} Extra caption detail that should survive.`,
    );
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

  it("honors measured canonical heights when rendered text is taller than estimates", () => {
    const base = createDefaultOverlayLayout("hero-quote");

    const fitted = fitOverlayLayoutToCopy(
      {
        layout: "hero-quote",
        hook: "A practical hook",
        headline: "A headline with real-world wrapping that rendered taller than expected.",
        supportingText:
          "A supporting paragraph that also rendered taller than the heuristic estimate in the browser preview.",
        cta: "Visit profile",
      },
      "4:5",
      base,
      undefined,
      {
        headline: 24.4,
        supportingText: 18.7,
      },
    );

    expect(fitted.headline.height).toBe(24.4);
    expect(fitted.supportingText.height).toBe(18.7);
    expect(fitted.supportingText.y).toBeGreaterThanOrEqual(
      fitted.headline.y + fitted.headline.height,
    );
    expect(fitted.cta.y).toBeGreaterThanOrEqual(
      fitted.supportingText.y + fitted.supportingText.height,
    );
  });

  it("does not shrink existing block heights when rounding fitted values", () => {
    const base = createDefaultOverlayLayout("hero-quote");
    base.headline.height = 12.04;

    const fitted = fitOverlayLayoutToCopy(
      {
        layout: "hero-quote",
        hook: "Short hook",
        headline: "Short headline",
        supportingText: "Supporting text that keeps the canonical stack active.",
        cta: "",
      },
      "4:5",
      base,
    );

    expect(fitted.headline.height).toBeGreaterThanOrEqual(12.04);
    expect(fitted.headline.height).toBe(12.1);
  });

  it("detects canonical overlaps and out-of-bounds blocks", () => {
    const layout = createDefaultOverlayLayout("hero-quote");
    layout.headline.y = 68;
    layout.headline.height = 20;
    layout.supportingText.y = 84;
    layout.supportingText.height = 18;
    layout.cta.y = 97;
    layout.cta.height = 6;

    const issues = analyzeCanonicalOverlayLayout({
      layout: "hero-quote",
      copy: {
        hook: "Hook",
        headline: "Headline",
        supportingText: "Body",
        cta: "CTA",
      },
      overlayLayout: layout,
    });

    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Headline overlaps Body",
        "CTA extends below the canvas",
      ]),
    );
  });

  it("ignores canonical blocks that overlap vertically but not horizontally", () => {
    const layout = createDefaultOverlayLayout("hero-quote");
    layout.headline.x = 4;
    layout.headline.width = 28;
    layout.headline.y = 68;
    layout.headline.height = 20;
    layout.supportingText.x = 60;
    layout.supportingText.width = 28;
    layout.supportingText.y = 74;
    layout.supportingText.height = 18;

    const issues = analyzeCanonicalOverlayLayout({
      layout: "hero-quote",
      copy: {
        hook: "Hook",
        headline: "Headline",
        supportingText: "Body",
        cta: "",
      },
      overlayLayout: layout,
    });

    expect(issues.some((issue) => issue.type === "overlap")).toBe(false);
  });

  it("detects canonical overlaps even when blocks are reordered vertically", () => {
    const layout = createDefaultOverlayLayout("hero-quote");
    layout.headline.x = 8;
    layout.headline.width = 44;
    layout.headline.y = 80;
    layout.headline.height = 18;
    layout.supportingText.x = 8;
    layout.supportingText.width = 44;
    layout.supportingText.y = 74;
    layout.supportingText.height = 18;

    const issues = analyzeCanonicalOverlayLayout({
      layout: "hero-quote",
      copy: {
        hook: "Hook",
        headline: "Headline",
        supportingText: "Body",
        cta: "",
      },
      overlayLayout: layout,
    });

    expect(issues.map((issue) => issue.message)).toContain(
      "Body overlaps Headline",
    );
  });

  it("reports no canonical geometry issues for fitted layouts", () => {
    const fitted = createFittedOverlayLayout(
      {
        ...makeVariant("geometry-clean", "single-image"),
        layout: "split-story",
        hook: "Practical hook",
        headline: "A clean headline that still needs a real layout pass",
        supportingText:
          "Supporting text with enough detail to exercise the stack without forcing an invalid layout.",
        cta: "Visit profile",
      },
      "4:5",
    );

    const issues = analyzeCanonicalOverlayLayout({
      layout: "split-story",
      copy: {
        hook: "Practical hook",
        headline: "A clean headline that still needs a real layout pass",
        supportingText:
          "Supporting text with enough detail to exercise the stack without forcing an invalid layout.",
        cta: "Visit profile",
      },
      overlayLayout: fitted,
    });

    expect(issues).toHaveLength(0);
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

  it("syncs refined copy into the overlay layout and re-fits canonical blocks", () => {
    const base = createDefaultOverlayLayout("hero-quote");
    base.hook.text = "Original hook";
    base.headline.text = "Original headline";
    base.headline.x = 14;
    base.supportingText.text = "Original supporting text";
    base.cta.text = "";
    base.custom = [
      {
        id: "custom-1",
        label: "Custom",
        x: 12,
        y: 12,
        width: 20,
        height: 8,
        text: "Keep this custom box",
        fontScale: 1,
        visible: true,
        bgOpacity: 0.2,
        borderRadius: 12,
      },
    ];

    const synced = syncOverlayLayoutToVariantCopy({
      variant: {
        ...makeVariant("refined-layout", "single-image"),
        layout: "hero-quote",
        hook: "A sharper hook after refinement",
        headline:
          "A significantly longer headline after refinement that should trigger a taller block and a safer stack",
        supportingText:
          "A longer supporting paragraph after refinement that should also restack below the headline instead of overlapping with it.",
        cta: "Visit profile",
      },
      currentLayout: "hero-quote",
      overlayLayout: base,
      aspectRatio: "4:5",
    });

    expect(synced.hook.text).toBe("A sharper hook after refinement");
    expect(synced.headline.text).toContain("significantly longer headline");
    expect(synced.headline.x).toBe(14);
    expect(synced.cta.text).toBe("");
    expect(synced.custom[0]?.id).toBe("custom-1");
    expect(synced.custom[0]?.text).toBe("Keep this custom box");
    expect(synced.custom[0]?.x).toBe(12);
    expect(synced.supportingText.y).toBeGreaterThanOrEqual(
      synced.headline.y + synced.headline.height,
    );
  });

  it("rebuilds from fitted defaults when refine changes the layout type", () => {
    const base = createDefaultOverlayLayout("hero-quote", {
      cornerRadius: 20,
      bgOpacity: 35,
    });
    base.headline.x = 14;
    base.custom = [
      {
        id: "custom-1",
        label: "Custom",
        x: 12,
        y: 12,
        width: 20,
        height: 8,
        text: "Legacy custom box",
        fontScale: 1,
        visible: true,
        bgOpacity: 20,
        borderRadius: 12,
      },
    ];

    const synced = syncOverlayLayoutToVariantCopy({
      variant: {
        ...makeVariant("refined-layout-change", "single-image"),
        layout: "magazine",
        hook: "Magazine hook",
        headline: "Magazine headline after a broader refine",
        supportingText: "Magazine supporting text after the layout changed.",
        cta: "Visit profile",
      },
      currentLayout: "hero-quote",
      overlayLayout: base,
      aspectRatio: "4:5",
    });

    expect(synced.headline.x).toBe(6);
    expect(synced.headline.y).toBeGreaterThanOrEqual(73);
    expect(synced.hook.borderRadius).toBe(20);
    expect(synced.hook.bgOpacity).toBe(35);
    expect(synced.custom).toHaveLength(0);
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
    const editorialCarousel = {
      ...carouselVariant,
      cta: "",
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
    expect(resolveVariantOverlayCopy(editorialCarousel, 1)).toMatchObject({
      hook: "Show the proof",
      headline: "Slide two headline",
      supportingText: "Slide two body with enough detail to satisfy the schema.",
      cta: "",
    });
  });
});

describe("StoredOverlayLayoutSchema bounds", () => {
  const makeBlock = (overrides: Record<string, unknown> = {}) => ({
    x: 10,
    y: 20,
    width: 50,
    height: 15,
    fontScale: 1,
    visible: true,
    text: "Test",
    ...overrides,
  });

  const makeLayout = (overrides: Record<string, unknown> = {}) => ({
    hook: makeBlock(),
    headline: makeBlock(),
    supportingText: makeBlock(),
    cta: makeBlock(),
    ...overrides,
  });

  it("accepts overlay positions outside 0..100 within -200..200", () => {
    const layout = makeLayout({
      hook: makeBlock({ x: -50, y: 150 }),
    });

    const result = StoredOverlayLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hook.x).toBe(-50);
      expect(result.data.hook.y).toBe(150);
    }
  });

  it("preserves overlayStrength when provided", () => {
    const layout = makeLayout({ overlayStrength: 42 });

    const result = StoredOverlayLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overlayStrength).toBe(42);
    }
  });

  it("rejects positions outside -200..200", () => {
    const layout = makeLayout({
      hook: makeBlock({ x: -201, y: 201 }),
    });

    const result = StoredOverlayLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it("preserves optional defaults for custom blocks and logo", () => {
    const layout = makeLayout();

    const result = StoredOverlayLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.custom).toEqual([]);
      expect(result.data.logo).toBeUndefined();
    }
  });
});
