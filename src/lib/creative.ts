import { z } from "zod";

import {
  buildPromptBestPracticeContext,
  isWineBrandSignals,
} from "@/lib/instagram-playbook";
import { generateStructuredJson, type ResolvedLlmAuth } from "@/lib/llm";

export const AspectRatioSchema = z.enum(["1:1", "4:5", "1.91:1", "9:16"]);

export const BrandInputSchema = z.object({
  brandName: z.string().trim().min(2).max(80),
  website: z.string().trim().max(240).optional().default(""),
  values: z.string().trim().min(10).max(1200),
  principles: z.string().trim().min(10).max(1200),
  story: z.string().trim().min(10).max(1800),
  voice: z.string().trim().min(10).max(600),
  visualDirection: z.string().trim().min(8).max(1200),
  palette: z.string().trim().min(3).max(200),
  logoNotes: z.string().trim().max(300).optional().default(""),
});

export const PostInputSchema = z.object({
  theme: z.string().trim().min(3).max(200),
  subject: z.string().trim().min(3).max(200),
  thought: z.string().trim().min(10).max(500),
  objective: z.string().trim().min(6).max(220),
  audience: z.string().trim().min(3).max(220),
  mood: z.string().trim().min(3).max(120),
  aspectRatio: AspectRatioSchema,
});

export const MediaTypeSchema = z.enum(["image", "video"]);

export const AssetDescriptorSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(160),
  mediaType: MediaTypeSchema,
  durationSec: z.number().min(0.5).max(900).optional(),
  width: z.number().min(120).max(8000).optional(),
  height: z.number().min(120).max(8000).optional(),
});

export const GenerationRequestSchema = z.object({
  brand: BrandInputSchema,
  post: PostInputSchema,
  assets: z.array(AssetDescriptorSchema).min(1).max(20),
  hasLogo: z.boolean(),
  promptConfig: z
    .object({
      systemPrompt: z.string().trim().max(2000).optional().default(""),
      customInstructions: z.string().trim().max(4000).optional().default(""),
    })
    .optional()
    .default({
      systemPrompt: "",
      customInstructions: "",
    }),
});

const LayoutSchema = z.enum([
  "hero-quote",
  "split-story",
  "magazine",
  "minimal-logo",
]);

export const PostTypeSchema = z.enum(["single-image", "carousel", "reel"]);

const CarouselSlideSchema = z.object({
  index: z.number().int().min(1).max(10),
  goal: z.string().trim().min(6).max(120),
  headline: z.string().trim().min(4).max(90),
  body: z.string().trim().min(12).max(180),
  assetHint: z.string().trim().min(3).max(80),
});

const ReelBeatSchema = z.object({
  atSec: z.number().min(0).max(180),
  visual: z.string().trim().min(6).max(140),
  onScreenText: z.string().trim().min(3).max(120),
  editAction: z.string().trim().min(3).max(100),
});

const ReelPlanSchema = z.object({
  targetDurationSec: z.number().min(6).max(90),
  hook: z.string().trim().min(8).max(140),
  coverFrameDirection: z.string().trim().min(8).max(140),
  audioDirection: z.string().trim().min(8).max(120),
  editingActions: z.array(z.string().trim().min(4).max(120)).min(4).max(10),
  beats: z.array(ReelBeatSchema).min(3).max(12),
  endCardCta: z.string().trim().min(8).max(120),
});

export type CreativeLayout = z.infer<typeof LayoutSchema>;
export type CanonicalOverlayKey =
  | "hook"
  | "headline"
  | "supportingText"
  | "cta";

export const CreativeVariantSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(3).max(42),
  postType: PostTypeSchema,
  hook: z.string().trim().min(8).max(140),
  headline: z.string().trim().min(8).max(120),
  supportingText: z.string().trim().min(20).max(260),
  cta: z.string().trim().min(5).max(80),
  caption: z.string().trim().min(40).max(700),
  hashtags: z
    .array(z.string().trim().regex(/^#[a-zA-Z0-9_]{2,30}$/))
    .min(5)
    .max(12),
  layout: LayoutSchema,
  textAlign: z.enum(["left", "center"]),
  colorHexes: z
    .array(z.string().trim().regex(/^#([A-Fa-f0-9]{6})$/))
    .min(2)
    .max(4),
  overlayStrength: z.number().min(0.15).max(0.85),
  assetSequence: z.array(z.string().trim().min(1)).min(1).max(10),
  carouselSlides: z.array(CarouselSlideSchema).min(3).max(10).optional(),
  reelPlan: ReelPlanSchema.optional(),
  score: z.number().min(1).max(10).optional(),
  scoreRationale: z.string().max(300).optional(),
});

export const GenerationResponseSchema = z.object({
  strategy: z.string().trim().min(30).max(800),
  variants: z.array(CreativeVariantSchema).length(3),
});

export const InternalGenerationResponseSchema = z.object({
  strategy: z.string().trim().min(30).max(800),
  variants: z.array(CreativeVariantSchema).min(3).max(8),
});

export const OverlayBlockSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(5).max(100),
  height: z.number().min(5).max(100),
  fontScale: z.number().min(0.6).max(2.4),
  visible: z.boolean().optional().default(true),
  text: z.string().trim().max(320).optional().default(""),
});

export const CustomOverlayBlockSchema = OverlayBlockSchema.extend({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(32).optional().default("Custom"),
});

export const LogoPositionSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(3).max(100),
  height: z.number().min(2).max(100),
  visible: z.boolean().optional().default(true),
});

export const OverlayLayoutSchema = z.object({
  hook: OverlayBlockSchema,
  headline: OverlayBlockSchema,
  supportingText: OverlayBlockSchema,
  cta: OverlayBlockSchema,
  custom: z.array(CustomOverlayBlockSchema).max(6).optional().default([]),
  logo: LogoPositionSchema.optional(),
});

export const PublishOutcomeInsightsSchema = z.object({
  impressions: z.number(),
  reach: z.number(),
  likes: z.number(),
  comments: z.number(),
  saves: z.number(),
  shares: z.number(),
  fetchedAt: z.string().datetime(),
});

export const PublishOutcomeSchema = z.object({
  id: z.string(),
  publishedAt: z.string().datetime(),
  publishId: z.string(),
  postType: PostTypeSchema,
  caption: z.string(),
  hook: z.string(),
  hashtags: z.array(z.string()),
  variantName: z.string(),
  brandName: z.string(),
  score: z.number().optional(),
  insights: PublishOutcomeInsightsSchema.optional(),
});

export type AspectRatio = z.infer<typeof AspectRatioSchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type PromptConfig = NonNullable<GenerationRequest["promptConfig"]>;
export type CreativeVariant = z.infer<typeof CreativeVariantSchema>;
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;
export type InternalGenerationResponse = z.infer<typeof InternalGenerationResponseSchema>;
export type OverlayBlock = z.infer<typeof OverlayBlockSchema>;
export type CustomOverlayBlock = z.infer<typeof CustomOverlayBlockSchema>;
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>;
export type LogoPosition = z.infer<typeof LogoPositionSchema>;
export type PublishOutcome = z.infer<typeof PublishOutcomeSchema>;

export const DEFAULT_LOGO_POSITION: LogoPosition = {
  x: 3,
  y: 3,
  width: 20,
  height: 6,
  visible: true,
};

const OVERLAY_DEFAULTS: Record<CreativeLayout, OverlayLayout> = {
  "hero-quote": {
    hook: { x: 8, y: 58, width: 72, height: 8, fontScale: 1, visible: true, text: "" },
    headline: { x: 8, y: 66, width: 80, height: 16, fontScale: 1, visible: true, text: "" },
    supportingText: { x: 8, y: 82, width: 84, height: 12, fontScale: 1, visible: true, text: "" },
    cta: { x: 8, y: 93, width: 64, height: 6, fontScale: 1, visible: true, text: "" },
    custom: [],
    logo: { ...DEFAULT_LOGO_POSITION },
  },
  "split-story": {
    hook: { x: 6, y: 60, width: 56, height: 7, fontScale: 1, visible: true, text: "" },
    headline: { x: 6, y: 67, width: 58, height: 14, fontScale: 1, visible: true, text: "" },
    supportingText: { x: 6, y: 81, width: 58, height: 11, fontScale: 1, visible: true, text: "" },
    cta: { x: 6, y: 92, width: 56, height: 6, fontScale: 1, visible: true, text: "" },
    custom: [],
    logo: { ...DEFAULT_LOGO_POSITION },
  },
  magazine: {
    hook: { x: 6, y: 72, width: 72, height: 7, fontScale: 1, visible: true, text: "" },
    headline: { x: 6, y: 79, width: 84, height: 12, fontScale: 1, visible: true, text: "" },
    supportingText: { x: 6, y: 90, width: 84, height: 8, fontScale: 1, visible: true, text: "" },
    cta: { x: 6, y: 96, width: 56, height: 5, fontScale: 1, visible: true, text: "" },
    custom: [],
    logo: { ...DEFAULT_LOGO_POSITION },
  },
  "minimal-logo": {
    hook: { x: 18, y: 24, width: 64, height: 8, fontScale: 1, visible: true, text: "" },
    headline: { x: 10, y: 34, width: 80, height: 22, fontScale: 1, visible: true, text: "" },
    supportingText: { x: 16, y: 56, width: 68, height: 16, fontScale: 1, visible: true, text: "" },
    cta: { x: 26, y: 74, width: 48, height: 8, fontScale: 1, visible: true, text: "" },
    custom: [],
    logo: { ...DEFAULT_LOGO_POSITION },
  },
};

export const createDefaultOverlayLayout = (layout: CreativeLayout): OverlayLayout => ({
  hook: { ...OVERLAY_DEFAULTS[layout].hook },
  headline: { ...OVERLAY_DEFAULTS[layout].headline },
  supportingText: { ...OVERLAY_DEFAULTS[layout].supportingText },
  cta: { ...OVERLAY_DEFAULTS[layout].cta },
  custom: [],
  logo: { ...DEFAULT_LOGO_POSITION },
});

const DEFAULT_CUSTOM_OVERLAY_BLOCK: Omit<CustomOverlayBlock, "id"> = {
  label: "Custom",
  x: 12,
  y: 14,
  width: 56,
  height: 12,
  fontScale: 1,
  visible: true,
  text: "",
};

const normalizeOverlayBlock = (
  block: Partial<OverlayBlock> | null | undefined,
  defaults: OverlayBlock,
): OverlayBlock => ({
  ...defaults,
  ...(block ?? {}),
});

const normalizeCustomOverlayBlock = (
  block: Partial<CustomOverlayBlock> | null | undefined,
  index: number,
): CustomOverlayBlock => ({
  ...DEFAULT_CUSTOM_OVERLAY_BLOCK,
  ...(block ?? {}),
  id: block?.id?.trim() || `custom-${index + 1}`,
});

export const normalizeOverlayLayout = (
  layoutType: CreativeLayout,
  layout?: Partial<OverlayLayout> | null,
): OverlayLayout => {
  const defaults = createDefaultOverlayLayout(layoutType);

  return {
    hook: normalizeOverlayBlock(layout?.hook, defaults.hook),
    headline: normalizeOverlayBlock(layout?.headline, defaults.headline),
    supportingText: normalizeOverlayBlock(
      layout?.supportingText,
      defaults.supportingText,
    ),
    cta: normalizeOverlayBlock(layout?.cta, defaults.cta),
    custom: Array.isArray(layout?.custom)
      ? layout.custom.map((block, index) =>
          normalizeCustomOverlayBlock(block, index),
        )
      : [],
    logo: layout?.logo ? { ...DEFAULT_LOGO_POSITION, ...layout.logo } : { ...DEFAULT_LOGO_POSITION },
  };
};

const FALLBACK_COLORS = ["#0F172A", "#F97316", "#22C55E", "#FFFFFF"];

const paletteToHex = (palette: string): string[] => {
  const matches = palette.match(/#([A-Fa-f0-9]{6})/g) ?? [];
  if (matches.length >= 2) {
    return matches.slice(0, 4);
  }

  return FALLBACK_COLORS.slice(0, 4);
};

const toTag = (value: string): string => {
  const condensed = value
    .replace(/[^a-zA-Z0-9_\s]/g, "")
    .trim()
    .replace(/\s+/g, "");
  const tag = condensed.slice(0, 24);
  if (tag.length < 2) {
    return "#Instagram";
  }
  return `#${tag}`;
};

const clampSlideCount = (count: number) => Math.max(3, Math.min(count, 8));

const buildCarouselSlides = (count: number, theme: string, audience: string) => {
  const limit = clampSlideCount(count);

  return Array.from({ length: limit }, (_, index) => ({
    index: index + 1,
    goal:
      index === 0
        ? "Stop the scroll with a sharp claim"
        : index === limit - 1
          ? "Close with a direct CTA"
          : "Deliver one clear proof point",
    headline:
      index === 0
        ? `${theme} without the fluff`
        : index === limit - 1
          ? "Ready to take the next step?"
          : `Proof point ${index}`,
    body:
      index === 0
        ? `Start with the strongest insight for ${audience.toLowerCase()}.`
        : index === limit - 1
          ? "Save this framework and share it with someone who needs it."
          : "Keep each slide to one idea, one visual, one short sentence.",
    assetHint: index === 0 ? "Hero product shot" : index === limit - 1 ? "Lifestyle close" : "Detail or context shot",
  }));
};

export const createFallbackResponse = (
  request: GenerationRequest,
): GenerationResponse => {
  const colors = paletteToHex(request.brand.palette);
  const imageAssets = request.assets.filter((asset) => asset.mediaType === "image");
  const videoAssets = request.assets.filter((asset) => asset.mediaType === "video");

  const tagPool = [
    request.brand.brandName,
    request.post.theme,
    request.post.subject,
    request.post.mood,
    "BrandStory",
    "VisualIdentity",
    "ContentStrategy",
    "InstagramMarketing",
  ];

  const hashtags = Array.from(new Set(tagPool.map(toTag))).slice(0, 10);

  const base = {
    supportingText: `${request.post.thought} Built for ${request.post.audience.toLowerCase()} with ${request.brand.brandName}'s core voice.`,
    caption: `${request.post.thought}\n\n${request.brand.brandName} turns ${request.post.theme.toLowerCase()} into a clear action: ${request.post.objective}. Save this post and share it with your team.`,
    hashtags,
    colorHexes: colors.slice(0, 3),
  };

  const singleAsset = imageAssets[0]?.id ?? request.assets[0].id;
  const carouselSequenceRaw = imageAssets.slice(0, 6).map((asset) => asset.id);
  const carouselSequence = carouselSequenceRaw.length ? carouselSequenceRaw : [singleAsset];

  const variants: GenerationResponse["variants"] = [
    {
      id: "variant-a",
      name: "Impact Hero",
      postType: "single-image",
      hook: `${request.post.theme}: a sharper way to lead the conversation.`,
      headline: `${request.post.subject} that actually moves people`,
      cta: `Take the next step: ${request.post.objective}`,
      layout: "hero-quote",
      textAlign: "left",
      overlayStrength: 0.58,
      assetSequence: [singleAsset],
      ...base,
    },
    {
      id: "variant-b",
      name: imageAssets.length >= 3 ? "Carousel Story" : "Story Split",
      postType: imageAssets.length >= 3 ? "carousel" : "single-image",
      hook: "From concept to result in clear steps",
      headline: `${request.post.theme} built on real principles`,
      cta: `Swipe and save for your next purchase`,
      layout: "split-story",
      textAlign: "left",
      overlayStrength: 0.5,
      assetSequence:
        imageAssets.length >= 3 ? carouselSequence : [singleAsset],
      carouselSlides:
        imageAssets.length >= 3
          ? buildCarouselSlides(carouselSequence.length, request.post.theme, request.post.audience)
          : undefined,
      ...base,
    },
    {
      id: "variant-c",
      name: videoAssets.length ? "Reel Momentum" : "Minimal Authority",
      postType: videoAssets.length ? "reel" : imageAssets.length >= 3 ? "carousel" : "single-image",
      hook: "Simple design. Strong conviction.",
      headline: `${request.brand.brandName} on ${request.post.theme}`,
      cta: `Save for your next content sprint`,
      layout: "minimal-logo",
      textAlign: "center",
      overlayStrength: 0.42,
      assetSequence: videoAssets.length
        ? [videoAssets[0].id, ...imageAssets.slice(0, 2).map((asset) => asset.id)]
        : imageAssets.length >= 3
          ? carouselSequence
          : [singleAsset],
      reelPlan: videoAssets.length
        ? {
            targetDurationSec: 18,
            hook: `In 18 seconds: why ${request.brand.brandName} stands out`,
            coverFrameDirection: "Use a hero product shot with high-contrast headline overlay",
            audioDirection: "Warm cinematic indie track with subtle build",
            editingActions: [
              "Start with fastest-motion hero shot within first 1.2 seconds",
              "Cut every 1.8-2.4 seconds",
              "Mix wide establishing shot, detail closeup, action macro",
              "Use bold captions centered in safe area",
              "End with branded CTA card",
            ],
            beats: [
              {
                atSec: 0,
                visual: "Fast product hero reveal",
                onScreenText: `Why ${request.brand.brandName}?`,
                editAction: "Hard cut + 105% zoom",
              },
              {
                atSec: 4,
                visual: "Wide context or environment shot",
                onScreenText: "Built on real principles",
                editAction: "Speed ramp then stabilize",
              },
              {
                atSec: 8,
                visual: "Detail or process closeup",
                onScreenText: "Precision at every step",
                editAction: "Match cut on shapes",
              },
              {
                atSec: 13,
                visual: "Product in use or lifestyle moment",
                onScreenText: "Designed for impact",
                editAction: "Slow motion at 80% speed",
              },
              {
                atSec: 16,
                visual: "Brand lockup + CTA card",
                onScreenText: "Take the next step",
                editAction: "Fade in CTA with subtle grain",
              },
            ],
            endCardCta: "Visit profile to learn more and get started",
          }
        : undefined,
      carouselSlides:
        !videoAssets.length && imageAssets.length >= 3
          ? buildCarouselSlides(carouselSequence.length, request.post.theme, request.post.audience)
          : undefined,
      ...base,
    },
  ];

  return {
    strategy:
      "These concepts balance discovery reach and conversion: one bold single image for thumb-stop impact, one educational carousel for saves/shares, and one reel-style narrative for high watch-through when video is available.",
    variants,
  };
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const ensureUniqueVariantIds = (variants: CreativeVariant[]): CreativeVariant[] => {
  const seen = new Set<string>();

  return variants.map((variant) => {
    const baseId = variant.id.trim() || "variant";
    if (!seen.has(baseId)) {
      seen.add(baseId);
      return variant;
    }

    let suffix = 2;
    let nextId = `${baseId}-${suffix}`;
    while (seen.has(nextId)) {
      suffix += 1;
      nextId = `${baseId}-${suffix}`;
    }
    seen.add(nextId);
    return { ...variant, id: nextId };
  });
};

export type InternalGenerationRecovery = {
  droppedInvalidVariants: number;
  usedFallbackVariants: number;
  truncatedVariants: number;
  strategyFallbackUsed: boolean;
};

export const coerceInternalGenerationResponse = (
  payload: unknown,
  request: GenerationRequest,
): {
  response: InternalGenerationResponse;
  recovery: InternalGenerationRecovery;
} => {
  const strict = InternalGenerationResponseSchema.safeParse(payload);
  if (strict.success) {
    return {
      response: strict.data,
      recovery: {
        droppedInvalidVariants: 0,
        usedFallbackVariants: 0,
        truncatedVariants: 0,
        strategyFallbackUsed: false,
      },
    };
  }

  const fallback = createFallbackResponse(request);
  const payloadRecord = isObjectRecord(payload) ? payload : {};
  const rawVariants = Array.isArray(payloadRecord.variants)
    ? payloadRecord.variants
    : [];

  const validVariants = rawVariants.flatMap((variant) => {
    const parsed = CreativeVariantSchema.safeParse(variant);
    return parsed.success ? [parsed.data] : [];
  });

  const droppedInvalidVariants = rawVariants.length - validVariants.length;
  const truncatedVariants =
    validVariants.length > 8 ? validVariants.length - 8 : 0;
  const trimmedVariants = ensureUniqueVariantIds(validVariants).slice(0, 8);
  const targetCount = Math.max(3, Math.min(8, trimmedVariants.length));
  const merged = ensureUniqueVariantIds([...trimmedVariants, ...fallback.variants]);
  const variants = merged.slice(0, targetCount);
  const usedFallbackVariants = Math.max(0, variants.length - trimmedVariants.length);

  const strategyCandidate =
    typeof payloadRecord.strategy === "string"
      ? payloadRecord.strategy.trim()
      : "";
  const strategy =
    strategyCandidate.length >= 30 && strategyCandidate.length <= 800
      ? strategyCandidate
      : fallback.strategy;
  const strategyFallbackUsed = strategy !== strategyCandidate;

  return {
    response: InternalGenerationResponseSchema.parse({ strategy, variants }),
    recovery: {
      droppedInvalidVariants,
      usedFallbackVariants,
      truncatedVariants,
      strategyFallbackUsed,
    },
  };
};

export const DEFAULT_GENERATION_SYSTEM_PROMPT =
  "You are Intelligent IG Poster, a world-class Instagram creative strategist and direct-response copywriter. Think strategically, respect brand constraints, and return valid JSON only (no markdown, no commentary).";

export const buildGenerationSystemPrompt = (promptConfig?: PromptConfig): string => {
  const customSystem = (promptConfig?.systemPrompt || "").trim();
  if (!customSystem) {
    return DEFAULT_GENERATION_SYSTEM_PROMPT;
  }

  return `${DEFAULT_GENERATION_SYSTEM_PROMPT}\n\nAdditional system directives:\n${customSystem}`;
};

export const selectTopVariants = (
  variants: CreativeVariant[],
  targetCount = 3,
): CreativeVariant[] => {
  if (variants.length <= targetCount) {
    return variants;
  }

  const scored = variants.map((variant) => {
    let score = 0;

    // Caption quality: prefer 100-500 char range
    const captionLen = variant.caption.length;
    if (captionLen >= 100 && captionLen <= 500) {
      score += 2;
    } else if (captionLen >= 40) {
      score += 1;
    }

    // CTA presence in caption
    if (/save|share|bookmark|tag|comment|follow|visit|link/i.test(variant.caption)) {
      score += 2;
    }

    // Hook strength: specific numbers or questions
    if (/\d/.test(variant.hook) || variant.hook.includes("?")) {
      score += 1;
    }

    // Hashtag count quality (prefer 7-10)
    if (variant.hashtags.length >= 7 && variant.hashtags.length <= 10) {
      score += 1;
    }

    return { variant, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Ensure postType diversity: pick the best of each type first
  const selected: CreativeVariant[] = [];
  const selectedIds = new Set<string>();
  const typeGroups = new Map<string, typeof scored>();

  for (const item of scored) {
    const type = item.variant.postType;
    if (!typeGroups.has(type)) {
      typeGroups.set(type, []);
    }
    typeGroups.get(type)!.push(item);
  }

  for (const [, items] of typeGroups) {
    if (selected.length < targetCount && items.length > 0) {
      selected.push(items[0].variant);
      selectedIds.add(items[0].variant.id);
    }
  }

  // Fill remaining with highest-scored not yet selected
  for (const item of scored) {
    if (selected.length >= targetCount) {
      break;
    }
    if (!selectedIds.has(item.variant.id)) {
      selected.push(item.variant);
      selectedIds.add(item.variant.id);
    }
  }

  return selected.slice(0, targetCount);
};

const VariantScoreSchema = z.object({
  id: z.string(),
  score: z.number().min(1).max(10),
  rationale: z.string().max(300),
});

const VariantScoresResponseSchema = z.object({
  scores: z.array(VariantScoreSchema),
});

type VariantScore = z.infer<typeof VariantScoreSchema>;

export const scoreVariantsWithLlm = async (
  auth: ResolvedLlmAuth,
  variants: CreativeVariant[],
  brand: { brandName: string; voice: string },
  post: { theme: string; audience: string; objective: string },
  signal?: AbortSignal,
): Promise<VariantScore[]> => {
  const variantSummaries = variants.map((v) => ({
    id: v.id,
    name: v.name,
    postType: v.postType,
    hook: v.hook,
    caption: v.caption,
    cta: v.cta,
    hashtags: v.hashtags,
  }));

  const result = await generateStructuredJson<unknown>({
    auth,
    systemPrompt:
      "You are an Instagram content quality judge. Score each variant on a 1-10 scale. Evaluate hook strength, caption quality, CTA effectiveness, brand voice alignment, and engagement potential. Return strict JSON only.",
    signal,
    userPrompt: `Score these Instagram creative variants for the brand "${brand.brandName}" (voice: ${brand.voice}).

Post context: Theme="${post.theme}", Audience="${post.audience}", Objective="${post.objective}"

Variants:
${JSON.stringify(variantSummaries, null, 2)}

Return JSON: { "scores": [{ "id": "<variant id>", "score": <1-10>, "rationale": "<1-2 sentence explanation>" }] }
Score each variant. Output JSON only.`,
    temperature: 0.3,
    maxTokens: 2000,
  });

  const parsed = VariantScoresResponseSchema.parse(result);
  const variantIds = new Set(variants.map((v) => v.id));
  // Filter to known variant IDs and warn on coverage gaps
  const validScores = parsed.scores.filter((s) => variantIds.has(s.id));
  if (validScores.length < variants.length) {
    console.warn(
      `Score coverage: ${validScores.length}/${variants.length} variants scored`,
    );
  }
  return validScores;
};

export const selectTopVariantsWithScores = (
  variants: CreativeVariant[],
  scores: VariantScore[],
  targetCount = 3,
): CreativeVariant[] => {
  const scoreMap = new Map(scores.map((s) => [s.id, s]));

  // Attach scores to variants
  const withScores = variants.map((v) => {
    const s = scoreMap.get(v.id);
    return {
      variant: { ...v, score: s?.score, scoreRationale: s?.rationale },
      score: s?.score ?? 0,
    };
  });

  withScores.sort((a, b) => b.score - a.score);

  if (withScores.length <= targetCount) {
    return withScores.map((w) => w.variant);
  }

  // Ensure postType diversity
  const selected: CreativeVariant[] = [];
  const selectedIds = new Set<string>();
  const typeGroups = new Map<string, typeof withScores>();

  for (const item of withScores) {
    const type = item.variant.postType;
    if (!typeGroups.has(type)) {
      typeGroups.set(type, []);
    }
    typeGroups.get(type)!.push(item);
  }

  for (const [, items] of typeGroups) {
    if (selected.length < targetCount && items.length > 0) {
      selected.push(items[0].variant);
      selectedIds.add(items[0].variant.id);
    }
  }

  for (const item of withScores) {
    if (selected.length >= targetCount) {
      break;
    }
    if (!selectedIds.has(item.variant.id)) {
      selected.push(item.variant);
      selectedIds.add(item.variant.id);
    }
  }

  return selected.slice(0, targetCount);
};

export const buildPerformanceContext = (outcomes: PublishOutcome[]): string => {
  const withInsights = outcomes
    .filter((o) => o.insights && o.insights.reach > 0)
    .map((o) => {
      const i = o.insights!;
      const engagementRate =
        i.reach > 0
          ? ((i.likes + i.comments + i.saves + i.shares) / i.reach) * 100
          : 0;
      return { outcome: o, engagementRate };
    })
    .sort((a, b) => b.engagementRate - a.engagementRate);

  if (withInsights.length === 0) {
    return "";
  }

  const top = withInsights.slice(0, 5);
  const bullets = top.map((item) => {
    const o = item.outcome;
    const i = o.insights!;
    const saveRate = i.reach > 0 ? ((i.saves / i.reach) * 100).toFixed(1) : "0";
    return `- Hook: "${o.hook.slice(0, 60)}", PostType: ${o.postType}, Engagement: ${item.engagementRate.toFixed(1)}%, Saves: ${saveRate}%`;
  });

  return `Performance insights from your recent posts (learn from what works):\n${bullets.join("\n")}`;
};

export const buildGenerationUserPrompt = (
  request: GenerationRequest,
  options?: {
    websiteStyleContext?: string;
    websiteBodyText?: string;
    candidateCount?: number;
    performanceContext?: string;
  },
): string => {
  const assetList = request.assets.map(
    (asset, index) =>
      `${index + 1}. id=${asset.id}, name=${asset.name}, type=${asset.mediaType}, durationSec=${asset.durationSec ?? "n/a"}, dimensions=${asset.width ?? "?"}x${asset.height ?? "?"}`,
  );

  const imageCount = request.assets.filter((asset) => asset.mediaType === "image").length;
  const videoCount = request.assets.filter((asset) => asset.mediaType === "video").length;
  const wineBrand = isWineBrandSignals(request.brand, request.post);
  const websiteStyleBlock = options?.websiteStyleContext
    ? `Website-derived style cues:\n${options.websiteStyleContext}\n`
    : "";
  const websiteBodyBlock = options?.websiteBodyText
    ? `Website body content (use for brand voice and messaging context):\n${options.websiteBodyText}\n`
    : "";
  const performanceBlock = options?.performanceContext
    ? `${options.performanceContext}\n`
    : "";
  const customInstructionBlock = request.promptConfig?.customInstructions?.trim()
    ? `Custom user instructions:\n${request.promptConfig.customInstructions.trim()}\n`
    : "";

  const variantCount = options?.candidateCount ?? 3;

  return `Generate ${variantCount} Instagram post creative variants as strict JSON.

Brand:
- Name: ${request.brand.brandName}
- Website: ${request.brand.website || "Not provided"}
- Values: ${request.brand.values}
- Principles: ${request.brand.principles}
- Story: ${request.brand.story}
- Voice: ${request.brand.voice}
- Visual direction: ${request.brand.visualDirection}
- Palette notes: ${request.brand.palette}
- Logo guidance: ${request.brand.logoNotes || "No extra logo guidance"}
${websiteStyleBlock}${websiteBodyBlock}${performanceBlock}
Post brief:
- Theme: ${request.post.theme}
- Subject: ${request.post.subject}
- Core thought: ${request.post.thought}
- Objective: ${request.post.objective}
- Audience: ${request.post.audience}
- Mood: ${request.post.mood}
- Preferred canvas: ${request.post.aspectRatio}

Available assets (${request.assets.length}; images=${imageCount}, videos=${videoCount}):
${assetList.join("\n")}
Has logo available: ${request.hasLogo ? "yes" : "no"}

${buildPromptBestPracticeContext(wineBrand)}
${customInstructionBlock}

Output constraints:
- Return JSON object with keys: strategy, variants.
- strategy: concise rationale focused on reach + conversion.
- variants: exactly ${variantCount} objects.
- each variant fields: id, name, postType, hook, headline, supportingText, cta, caption, hashtags, layout, textAlign, colorHexes, overlayStrength, assetSequence, carouselSlides, reelPlan.
- postType must be one of single-image, carousel, reel.
- layout must be one of hero-quote, split-story, magazine, minimal-logo.
- textAlign must be left or center.
- hook and headline must each be at least 8 characters.
- supportingText must be at least 20 characters.
- cta must be at least 5 characters.
- caption must be at least 40 characters.
- colorHexes must be 2-4 valid hex colors.
- hashtags must be 5-12 items and each must match ^#[a-zA-Z0-9_]{2,30}$ (letters, numbers, underscore only).
- assetSequence: asset ids only, 1-10 items.
- If postType=carousel, include carouselSlides with 3-10 slides and each slide must include index, goal, headline, body, assetHint.
- If postType=reel, include reelPlan with targetDurationSec, hook, coverFrameDirection, audioDirection, editingActions (4-10), beats (3-12), endCardCta.
- reelPlan.beats must be an array of objects with keys: atSec (number), visual (string), onScreenText (string), editAction (string). Never return numeric arrays for beats.
- If videoCount > 0, at least one variant must be postType=reel.
- If imageCount >= 3, at least one variant must be postType=carousel.
- For wine/alcohol brands: avoid unsafe or non-compliant alcohol messaging.
- Avoid generic language and avoid emojis.
- Output JSON only.`;
};
