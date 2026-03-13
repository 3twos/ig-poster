import { z } from "zod";

import {
  buildPromptBestPracticeContext,
  isWineBrandSignals,
} from "@/lib/instagram-playbook";
import { generateStructuredJson, type ResolvedLlmAuth } from "@/lib/llm";

export const AspectRatioSchema = z.enum(["1:1", "4:5", "1.91:1", "9:16"]);
export const CtaPolicySchema = z.enum([
  "support-objective",
  "avoid",
  "require",
]);

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
  ctaPolicy: CtaPolicySchema.optional().default("support-objective"),
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
  cta: z.string().trim().max(80).optional().default(""),
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
  borderRadius: z.number().min(0).max(9999).optional(),
  bgOpacity: z.number().min(0).max(100).optional(),
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
export type CtaPolicy = z.infer<typeof CtaPolicySchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type PromptConfig = NonNullable<GenerationRequest["promptConfig"]>;
export type CarouselSlide = z.infer<typeof CarouselSlideSchema>;
export type CreativeVariant = z.infer<typeof CreativeVariantSchema>;
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;
export type InternalGenerationResponse = z.infer<typeof InternalGenerationResponseSchema>;
export type OverlayBlock = z.infer<typeof OverlayBlockSchema>;
export type CustomOverlayBlock = z.infer<typeof CustomOverlayBlockSchema>;
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>;
export type LogoPosition = z.infer<typeof LogoPositionSchema>;
export type OverlayGeometryIssue = {
  type: "overlap" | "out-of-bounds";
  key: CanonicalOverlayKey;
  relatedKey?: CanonicalOverlayKey;
  message: string;
};
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
    hook: { x: 6, y: 68, width: 72, height: 7, fontScale: 1, visible: true, text: "" },
    headline: { x: 6, y: 75, width: 84, height: 12, fontScale: 1, visible: true, text: "" },
    supportingText: { x: 6, y: 87, width: 84, height: 8, fontScale: 1, visible: true, text: "" },
    cta: { x: 6, y: 95, width: 56, height: 4, fontScale: 1, visible: true, text: "" },
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

export const createDefaultOverlayLayout = (
  layout: CreativeLayout,
  brandDefaults?: { cornerRadius?: number; bgOpacity?: number },
): OverlayLayout => {
  const base = OVERLAY_DEFAULTS[layout];
  const br = brandDefaults?.cornerRadius;
  const bg = brandDefaults?.bgOpacity;
  const applyDefaults = (block: OverlayBlock): OverlayBlock => ({
    ...block,
    ...(br != null ? { borderRadius: br } : {}),
    ...(bg != null ? { bgOpacity: bg } : {}),
  });
  return {
    hook: applyDefaults({ ...base.hook }),
    headline: applyDefaults({ ...base.headline }),
    supportingText: applyDefaults({ ...base.supportingText }),
    cta: { ...base.cta, ...(br != null ? { borderRadius: br } : {}) },
    custom: [],
    logo: { ...DEFAULT_LOGO_POSITION },
  };
};

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

const VIRTUAL_CANVAS_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1000, height: 1000 },
  "4:5": { width: 1000, height: 1250 },
  "1.91:1": { width: 1000, height: 524 },
  "9:16": { width: 1000, height: 1778 },
};

const LAYOUT_SAFE_STACKS: Record<
  CreativeLayout,
  { top: number; bottom: number; gap: number }
> = {
  "hero-quote": { top: 52, bottom: 99, gap: 1.5 },
  "split-story": { top: 58, bottom: 98, gap: 1.35 },
  magazine: { top: 66, bottom: 99, gap: 1.1 },
  "minimal-logo": { top: 22, bottom: 84, gap: 1.4 },
};

const CANONICAL_BLOCK_METRICS: Record<
  CanonicalOverlayKey,
  {
    baseFontRem: number;
    lineHeight: number;
    paddingPx: number;
    charWidthFactor: number;
  }
> = {
  hook: {
    baseFontRem: 0.75,
    lineHeight: 1.2,
    paddingPx: 24,
    charWidthFactor: 0.58,
  },
  headline: {
    baseFontRem: 1.875,
    lineHeight: 1.05,
    paddingPx: 24,
    charWidthFactor: 0.54,
  },
  supportingText: {
    baseFontRem: 0.875,
    lineHeight: 1.45,
    paddingPx: 24,
    charWidthFactor: 0.57,
  },
  cta: {
    baseFontRem: 0.75,
    lineHeight: 1.1,
    paddingPx: 18,
    charWidthFactor: 0.58,
  },
};

const LAYOUT_COPY_BUDGETS: Record<
  CreativeLayout,
  { hook: number; headline: number; supportingText: number; cta: number }
> = {
  "hero-quote": { hook: 42, headline: 58, supportingText: 120, cta: 24 },
  "split-story": { hook: 38, headline: 46, supportingText: 96, cta: 22 },
  magazine: { hook: 34, headline: 42, supportingText: 82, cta: 20 },
  "minimal-logo": { hook: 44, headline: 54, supportingText: 110, cta: 24 },
};

const trimToWordBoundary = (value: string, max: number) => {
  const text = value.trim();
  if (text.length <= max) {
    return text;
  }

  const slice = text.slice(0, Math.max(0, max - 3));
  const lastSpace = slice.lastIndexOf(" ");
  const clipped = lastSpace >= Math.max(8, Math.floor(max * 0.55))
    ? slice.slice(0, lastSpace)
    : slice;
  return `${clipped.trim()}...`;
};

export const applyLayoutCopyBudget = (
  variant: CreativeVariant,
): CreativeVariant => {
  const budget = LAYOUT_COPY_BUDGETS[variant.layout];

  return {
    ...variant,
    hook: trimToWordBoundary(variant.hook, budget.hook),
    headline: trimToWordBoundary(variant.headline, budget.headline),
    supportingText: trimToWordBoundary(
      variant.supportingText,
      budget.supportingText,
    ),
    cta: variant.cta ? trimToWordBoundary(variant.cta, budget.cta) : "",
  };
};

type RefineShortenIntensity = "standard" | "aggressive";

type RefinementToneDirection =
  | "preserve"
  | "editorial"
  | "premium"
  | "direct"
  | "playful";

type RefinementCtaAction =
  | "preserve"
  | "remove"
  | "add"
  | "keep-empty";

export type RefinementPlan = {
  shorten: {
    hook: boolean;
    headline: boolean;
    supportingText: boolean;
    cta: boolean;
    caption: boolean;
    intensity: RefineShortenIntensity;
  };
  ctaAction: RefinementCtaAction;
  toneDirection: RefinementToneDirection;
  audienceHint: string | null;
  preserveLayout: boolean;
};

const CTA_REMOVE_PATTERN =
  /\b(?:avoid|remove|drop|skip|omit|without|no)\s+(?:the\s+)?(?:cta|call[\s-]?to[\s-]?action)s?\b/;
const CTA_ADD_PATTERN =
  /\b(?:add|include|write|create)\s+(?:an?\s+)?(?:(?:short|brief|clear|specific|simple|direct|strong)\s+){0,2}(?:cta|call[\s-]?to[\s-]?action)\b/;
const SHORTEN_PATTERN =
  /\b(?:shorter|shorten|concise|punchier|tighter|trim|reduce|leaner)\b|(?:less|fewer)\s+(?:text|copy|words)/;
const AGGRESSIVE_SHORTEN_PATTERN =
  /\b(?:significantly|substantially|dramatically|considerably)\b|\b(?:much|way|far)\s+shorter\b/;
const HOOK_PATTERN = /\bhook\b/;
const HEADLINE_PATTERN = /\bheadline\b/;
const BODY_PATTERN =
  /\b(?:body|supporting text|supporting copy|body copy|paragraph|paragraphs)\b/;
const CAPTION_PATTERN = /\b(?:caption|captions|hashtags)\b/;
const OVERLAY_PATTERN =
  /\b(?:component|components|overlay|hook|headline|body|supporting text|on-canvas|text boxes)\b/;
const EDITORIAL_ONLY_PATTERN =
  /\b(?:(?:purely|strictly|fully)\s+editorial|editorial[- ]only)\b/;
const PREMIUM_TONE_PATTERN =
  /\b(?:premium|luxury|luxurious|sophisticated|elevated|aspirational)\b/;
const DIRECT_TONE_PATTERN =
  /\b(?:more\s+direct|direct(?:\s+tone)?|clearer\s+tone|plainspoken|plain-spoken|straightforward)\b/;
const PLAYFUL_TONE_PATTERN = /\b(?:playful|lighter|witty|fun|funny)\b/;
const LAYOUT_CHANGE_PATTERN =
  /\b(?:change|switch|rework|different|new)\s+(?:the\s+)?(?:layout|template|design|visual|composition)\b|\b(?:move|reposition|restack|resize)\b/;
const AUDIENCE_RETARGET_PATTERN =
  /\b(?:retarget|rewrite|rework|adapt|tailor|aim|target)(?:\s+(?:this|it))?\s+(?:for|toward(?:s)?|to)\s+([^.,;\n]{3,80})/;
const AUDIENCE_LABEL_PATTERN =
  /\baudience\s*:\s*([^.,;\n]{3,80})/;

const REFINE_SHORTEN_FACTORS: Record<RefineShortenIntensity, number> = {
  standard: 0.82,
  aggressive: 0.68,
};

const trimTowardLength = (
  candidate: string,
  current: string,
  options: { minLength: number; maxLength: number; factor: number },
) => {
  const nextValue = candidate.trim();
  const currentValue = current.trim();

  if (!nextValue || !currentValue) {
    return nextValue;
  }

  const rawTarget = Math.floor(currentValue.length * options.factor);
  const target = Math.min(
    options.maxLength,
    Math.max(options.minLength, rawTarget),
  );

  if (nextValue.length <= target) {
    return nextValue;
  }

  if (target < 4) {
    return options.minLength === 0 ? "" : nextValue.slice(0, target).trim();
  }

  return trimToWordBoundary(nextValue, target);
};

const normalizeAudienceHint = (value: string | undefined) => {
  const trimmed = value?.trim().replace(/^["']|["']$/g, "") ?? "";
  return trimmed.length >= 3 ? trimmed : null;
};

export const deriveRefinementPlan = (
  instruction: string,
  variant: Pick<CreativeVariant, "cta">,
  ctaPolicy?: CtaPolicy,
): RefinementPlan => {
  const normalized = instruction.trim().toLowerCase();
  const shortenRequested = SHORTEN_PATTERN.test(normalized);
  const mentionsCaption = CAPTION_PATTERN.test(normalized);
  const mentionsOverlay = OVERLAY_PATTERN.test(normalized);
  const mentionsHook = HOOK_PATTERN.test(normalized);
  const mentionsHeadline = HEADLINE_PATTERN.test(normalized);
  const mentionsBody = BODY_PATTERN.test(normalized);
  const mentionsCta = /\b(?:cta|call[\s-]?to[\s-]?action)\b/.test(normalized);
  const hasSpecificCopyTarget = mentionsHook || mentionsHeadline || mentionsBody;
  const applyGenericOverlayShorten =
    mentionsOverlay || (!hasSpecificCopyTarget && !mentionsCaption);
  const shortenOverlay =
    shortenRequested && (applyGenericOverlayShorten || hasSpecificCopyTarget);
  const audienceMatch =
    normalized.match(AUDIENCE_RETARGET_PATTERN)?.[1] ??
    normalized.match(AUDIENCE_LABEL_PATTERN)?.[1];

  return {
    shorten: {
      hook:
        shortenOverlay &&
        (mentionsHook || (!hasSpecificCopyTarget && applyGenericOverlayShorten)),
      headline:
        shortenOverlay &&
        (mentionsHeadline || (!hasSpecificCopyTarget && applyGenericOverlayShorten)),
      supportingText:
        shortenOverlay &&
        (mentionsBody || (!hasSpecificCopyTarget && applyGenericOverlayShorten)),
      cta:
        shortenOverlay &&
        (mentionsCta || (!hasSpecificCopyTarget && applyGenericOverlayShorten)),
      caption: shortenRequested && (mentionsCaption || !mentionsOverlay),
      intensity: AGGRESSIVE_SHORTEN_PATTERN.test(normalized)
        ? "aggressive"
        : "standard",
    },
    ctaAction:
      CTA_REMOVE_PATTERN.test(normalized) || EDITORIAL_ONLY_PATTERN.test(normalized)
        ? "remove"
        : CTA_ADD_PATTERN.test(normalized)
          ? "add"
          : ctaPolicy !== "require" && variant.cta.trim().length === 0
            ? "keep-empty"
            : "preserve",
    toneDirection: EDITORIAL_ONLY_PATTERN.test(normalized)
      ? "editorial"
      : PREMIUM_TONE_PATTERN.test(normalized)
        ? "premium"
        : DIRECT_TONE_PATTERN.test(normalized)
          ? "direct"
          : PLAYFUL_TONE_PATTERN.test(normalized)
            ? "playful"
            : "preserve",
    audienceHint: normalizeAudienceHint(audienceMatch),
    preserveLayout: !LAYOUT_CHANGE_PATTERN.test(normalized),
  };
};

const buildRefinementPlanBlock = (plan: RefinementPlan) => {
  return `Parsed refinement plan (structured interpretation of the instruction):\n${JSON.stringify(plan, null, 2)}\n\n`;
};

export const applyRefinementPlan = (input: {
  currentVariant: CreativeVariant;
  refinedVariant: CreativeVariant;
  instruction: string;
  post?: Pick<GenerationRequest["post"], "ctaPolicy" | "objective">;
  instructionPlan?: RefinementPlan;
}): CreativeVariant => {
  const plan =
    input.instructionPlan ??
    deriveRefinementPlan(
      input.instruction,
      input.currentVariant,
      input.post?.ctaPolicy,
    );
  const factor = REFINE_SHORTEN_FACTORS[plan.shorten.intensity];
  const budget = LAYOUT_COPY_BUDGETS[input.currentVariant.layout];

  const nextVariant: CreativeVariant = {
    ...input.refinedVariant,
    carouselSlides: input.refinedVariant.carouselSlides?.map((slide) => ({ ...slide })),
    reelPlan: input.refinedVariant.reelPlan
      ? {
          ...input.refinedVariant.reelPlan,
          editingActions: [...input.refinedVariant.reelPlan.editingActions],
          beats: input.refinedVariant.reelPlan.beats.map((beat) => ({ ...beat })),
        }
      : undefined,
  };

  if (plan.shorten.hook) {
    nextVariant.hook = trimTowardLength(nextVariant.hook, input.currentVariant.hook, {
      minLength: 8,
      maxLength: budget.hook,
      factor,
    });
  }

  if (plan.shorten.headline) {
    nextVariant.headline = trimTowardLength(
      nextVariant.headline,
      input.currentVariant.headline,
      {
        minLength: 8,
        maxLength: budget.headline,
        factor,
      },
    );
  }

  if (plan.shorten.supportingText) {
    nextVariant.supportingText = trimTowardLength(
      nextVariant.supportingText,
      input.currentVariant.supportingText,
      {
        minLength: 20,
        maxLength: budget.supportingText,
        factor,
      },
    );
  }

  if (plan.shorten.cta && nextVariant.cta.trim()) {
    nextVariant.cta = trimTowardLength(nextVariant.cta, input.currentVariant.cta, {
      minLength: 0,
      maxLength: budget.cta,
      factor,
    });
  }

  if (
    nextVariant.carouselSlides?.length &&
    (plan.shorten.hook || plan.shorten.headline || plan.shorten.supportingText)
  ) {
    nextVariant.carouselSlides = nextVariant.carouselSlides.map((slide, index) => {
      const currentSlide = input.currentVariant.carouselSlides?.[index] ?? slide;

      return {
        ...slide,
        goal: plan.shorten.hook
          ? trimTowardLength(slide.goal, currentSlide.goal, {
              minLength: 6,
              maxLength: budget.hook,
              factor,
            })
          : slide.goal,
        headline: plan.shorten.headline
          ? trimTowardLength(slide.headline, currentSlide.headline, {
              minLength: 4,
              maxLength: budget.headline,
              factor,
            })
          : slide.headline,
        body: plan.shorten.supportingText
          ? trimTowardLength(slide.body, currentSlide.body, {
              minLength: 12,
              maxLength: budget.supportingText,
              factor,
            })
          : slide.body,
      };
    });
  }

  if (plan.shorten.caption) {
    nextVariant.caption = trimTowardLength(nextVariant.caption, input.currentVariant.caption, {
      minLength: 40,
      maxLength: 700,
      factor,
    });
  }

  if (
    plan.ctaAction === "remove" ||
    (plan.ctaAction === "keep-empty" && input.post?.ctaPolicy !== "require")
  ) {
    nextVariant.cta = "";
  } else if (plan.ctaAction === "add" && !nextVariant.cta.trim()) {
    nextVariant.cta = resolveRequiredCta(
      input.post?.objective ?? "",
      input.currentVariant.cta,
    );
  } else if (
    input.post?.ctaPolicy === "avoid" &&
    plan.ctaAction !== "add"
  ) {
    nextVariant.cta = "";
  } else if (input.post?.ctaPolicy === "require" && !nextVariant.cta.trim()) {
    nextVariant.cta = resolveRequiredCta(
      input.post.objective,
      input.currentVariant.cta,
    );
  }

  return applyLayoutCopyBudget(nextVariant);
};

const estimateTextLines = (
  text: string,
  availableWidthPx: number,
  fontPx: number,
  charWidthFactor: number,
) => {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  const charsPerLine = Math.max(
    6,
    Math.floor(availableWidthPx / Math.max(fontPx * charWidthFactor, 1)),
  );

  return normalized
    .split("\n")
    .reduce((total, line) => {
      const nextLine = line.trim();
      if (!nextLine) {
        return total + 1;
      }
      return total + Math.max(1, Math.ceil(nextLine.length / charsPerLine));
    }, 0);
};

const roundOverlayPercent = (value: number) => Math.round(value * 10) / 10;

const ceilOverlayPercent = (value: number) => Math.ceil(value * 10) / 10;

const clampOverlayBlockHeight = (value: number) =>
  Math.min(100, Math.max(5, ceilOverlayPercent(value)));

const estimateCanonicalBlockHeight = (params: {
  key: CanonicalOverlayKey;
  block: OverlayBlock;
  text: string;
  aspectRatio: AspectRatio;
}) => {
  const metrics = CANONICAL_BLOCK_METRICS[params.key];
  const canvas = VIRTUAL_CANVAS_SIZES[params.aspectRatio];
  const fontPx = metrics.baseFontRem * params.block.fontScale * 16;
  const availableWidthPx = Math.max(
    64,
    canvas.width * (params.block.width / 100) - metrics.paddingPx,
  );
  const lines = estimateTextLines(
    params.text,
    availableWidthPx,
    fontPx,
    metrics.charWidthFactor,
  );
  if (lines === 0) {
    return params.block.height;
  }

  const estimatedPx = lines * fontPx * metrics.lineHeight + metrics.paddingPx;
  const estimatedPct = (estimatedPx / canvas.height) * 100;
  return clampOverlayBlockHeight(Math.max(params.block.height, estimatedPct));
};

export const resolveVariantOverlayCopy = (
  variant: Pick<
    CreativeVariant,
    "postType" | "hook" | "headline" | "supportingText" | "cta" | "carouselSlides"
  >,
  activeSlideIndex = 0,
  carouselSlides: CarouselSlide[] | undefined = variant.carouselSlides,
) => {
  const normalizedSlideIndex = Math.max(0, activeSlideIndex);
  const lastSlideIndex = Math.max((carouselSlides?.length ?? 1) - 1, 0);
  const clampedSlideIndex = Math.min(normalizedSlideIndex, lastSlideIndex);
  const slide = carouselSlides?.[clampedSlideIndex];

  if (!slide || variant.postType !== "carousel" || clampedSlideIndex === 0) {
    return {
      hook: variant.hook,
      headline: variant.headline,
      supportingText: variant.supportingText,
      cta: variant.cta,
    };
  }

  return {
    hook: slide.goal,
    headline: slide.headline,
    supportingText: slide.body,
    cta:
      clampedSlideIndex === lastSlideIndex
        ? variant.cta
        : variant.cta.trim()
          ? "Swipe for more"
          : "",
  };
};

export const fitOverlayLayoutToCopy = (
  input: {
    layout: CreativeLayout;
    hook: string;
    headline: string;
    supportingText: string;
    cta?: string;
  },
  aspectRatio: AspectRatio,
  layout?: Partial<OverlayLayout> | null,
  brandDefaults?: { cornerRadius?: number; bgOpacity?: number },
  // Percent-of-canvas heights in [0, 100] captured from live DOM rendering.
  measuredHeightsPercent?: Partial<Record<CanonicalOverlayKey, number>>,
): OverlayLayout => {
  const base = layout
    ? normalizeOverlayLayout(input.layout, layout)
    : createDefaultOverlayLayout(input.layout, brandDefaults);
  const stack = LAYOUT_SAFE_STACKS[input.layout];
  const orderedKeys: CanonicalOverlayKey[] = [
    "hook",
    "headline",
    "supportingText",
    "cta",
  ];
  const copyByKey: Record<CanonicalOverlayKey, string> = {
    hook: input.hook,
    headline: input.headline,
    supportingText: input.supportingText,
    cta: input.cta ?? "",
  };
  const activeKeys = orderedKeys.filter((key) => {
    const block = base[key];
    return (block.visible ?? true) && copyByKey[key].trim().length > 0;
  });

  if (activeKeys.length === 0) {
    return base;
  }

  const next: OverlayLayout = {
    ...base,
    hook: { ...base.hook },
    headline: { ...base.headline },
    supportingText: { ...base.supportingText },
    cta: { ...base.cta },
    custom: [...base.custom],
    logo: base.logo ? { ...base.logo } : undefined,
  };

  const heights = Object.fromEntries(
    activeKeys.map((key) => [
      key,
      clampOverlayBlockHeight(
        Math.max(
          estimateCanonicalBlockHeight({
            key,
            block: next[key],
            text: copyByKey[key],
            aspectRatio,
          }),
          measuredHeightsPercent?.[key] ?? 0,
        ),
      ),
    ]),
  ) as Record<CanonicalOverlayKey, number>;

  const availableHeight = stack.bottom - stack.top;
  const gapCount = Math.max(activeKeys.length - 1, 0);
  let gap = stack.gap;
  let totalHeight =
    activeKeys.reduce((sum, key) => sum + heights[key], 0) + gap * gapCount;

  if (gapCount > 0 && totalHeight > availableHeight) {
    gap = Math.max(0.4, gap - (totalHeight - availableHeight) / gapCount);
    totalHeight =
      activeKeys.reduce((sum, key) => sum + heights[key], 0) + gap * gapCount;
  }

  let currentY =
    input.layout === "minimal-logo"
      ? stack.top
      : Math.max(stack.top, stack.bottom - totalHeight);

  for (const key of activeKeys) {
    next[key] = {
      ...next[key],
      y: roundOverlayPercent(currentY),
      height: heights[key],
    };
    currentY += heights[key] + gap;
  }

  return next;
};

const CANONICAL_OVERLAY_LABELS: Record<CanonicalOverlayKey, string> = {
  hook: "Hook",
  headline: "Headline",
  supportingText: "Body",
  cta: "CTA",
};

export const analyzeCanonicalOverlayLayout = (input: {
  layout: CreativeLayout;
  copy: {
    hook: string;
    headline: string;
    supportingText: string;
    cta?: string;
  };
  overlayLayout?: Partial<OverlayLayout> | null;
}): OverlayGeometryIssue[] => {
  const layout = normalizeOverlayLayout(input.layout, input.overlayLayout);
  const orderedKeys: CanonicalOverlayKey[] = [
    "hook",
    "headline",
    "supportingText",
    "cta",
  ];
  const copyByKey: Record<CanonicalOverlayKey, string> = {
    hook: input.copy.hook,
    headline: input.copy.headline,
    supportingText: input.copy.supportingText,
    cta: input.copy.cta ?? "",
  };
  const activeKeys = orderedKeys.filter((key) => {
    const block = layout[key];
    return (block.visible ?? true) && copyByKey[key].trim().length > 0;
  });

  const issues: OverlayGeometryIssue[] = [];

  for (const key of activeKeys) {
    const block = layout[key];
    const rightEdge = block.x + block.width;
    const bottomEdge = block.y + block.height;

    if (rightEdge > 100.1) {
      issues.push({
        type: "out-of-bounds",
        key,
        message: `${CANONICAL_OVERLAY_LABELS[key]} extends beyond the right edge`,
      });
    }

    if (bottomEdge > 100.1) {
      issues.push({
        type: "out-of-bounds",
        key,
        message: `${CANONICAL_OVERLAY_LABELS[key]} extends below the canvas`,
      });
    }
  }

  const rectanglesIntersect = (
    firstKey: CanonicalOverlayKey,
    secondKey: CanonicalOverlayKey,
  ) => {
    const first = layout[firstKey];
    const second = layout[secondKey];
    const horizontalOverlap =
      Math.max(first.x, second.x) + 0.1 <
      Math.min(first.x + first.width, second.x + second.width);
    const verticalOverlap =
      Math.max(first.y, second.y) + 0.1 <
      Math.min(first.y + first.height, second.y + second.height);

    return horizontalOverlap && verticalOverlap;
  };

  for (let index = 0; index < activeKeys.length - 1; index += 1) {
    for (let nextIndex = index + 1; nextIndex < activeKeys.length; nextIndex += 1) {
      const firstCandidate = activeKeys[index];
      const secondCandidate = activeKeys[nextIndex];

      if (!rectanglesIntersect(firstCandidate, secondCandidate)) {
        continue;
      }

      const firstBlock = layout[firstCandidate];
      const secondBlock = layout[secondCandidate];
      const firstKey =
        firstBlock.y < secondBlock.y ||
        (Math.abs(firstBlock.y - secondBlock.y) <= 0.1 &&
          firstBlock.x <= secondBlock.x)
          ? firstCandidate
          : secondCandidate;
      const secondKey = firstKey === firstCandidate ? secondCandidate : firstCandidate;

      issues.push({
        type: "overlap",
        key: secondKey,
        relatedKey: firstKey,
        message: `${CANONICAL_OVERLAY_LABELS[firstKey]} overlaps ${CANONICAL_OVERLAY_LABELS[secondKey]}`,
      });
    }
  }

  return issues;
};

export const createFittedOverlayLayout = (
  variant: Pick<
    CreativeVariant,
    "layout" | "hook" | "headline" | "supportingText" | "cta"
  >,
  aspectRatio: AspectRatio,
  brandDefaults?: { cornerRadius?: number; bgOpacity?: number },
) =>
  fitOverlayLayoutToCopy(
    {
      layout: variant.layout,
      hook: variant.hook,
      headline: variant.headline,
      supportingText: variant.supportingText,
      cta: variant.cta,
    },
    aspectRatio,
    null,
    brandDefaults,
  );

const inferOverlayBrandDefaults = (layout: OverlayLayout) => {
  const canonicalBlocks = [
    layout.hook,
    layout.headline,
    layout.supportingText,
    layout.cta,
  ];

  return {
    cornerRadius: canonicalBlocks.find((block) => block.borderRadius != null)
      ?.borderRadius,
    bgOpacity: canonicalBlocks.find((block) => block.bgOpacity != null)?.bgOpacity,
  };
};

export const syncOverlayLayoutToVariantCopy = (input: {
  variant: Pick<
    CreativeVariant,
    "layout" | "hook" | "headline" | "supportingText" | "cta"
  >;
  currentLayout: CreativeLayout;
  overlayLayout: OverlayLayout;
  aspectRatio: AspectRatio;
}) => {
  if (input.currentLayout !== input.variant.layout) {
    return createFittedOverlayLayout(
      input.variant,
      input.aspectRatio,
      inferOverlayBrandDefaults(input.overlayLayout),
    );
  }

  const nextCopy = {
    hook: input.overlayLayout.hook.text.trim()
      ? input.variant.hook
      : input.overlayLayout.hook.text,
    headline: input.overlayLayout.headline.text.trim()
      ? input.variant.headline
      : input.overlayLayout.headline.text,
    supportingText: input.overlayLayout.supportingText.text.trim()
      ? input.variant.supportingText
      : input.overlayLayout.supportingText.text,
    cta: input.overlayLayout.cta.text.trim()
      ? input.variant.cta
      : input.overlayLayout.cta.text,
  };

  const synced = {
    ...input.overlayLayout,
    hook: {
      ...input.overlayLayout.hook,
      text: nextCopy.hook,
    },
    headline: {
      ...input.overlayLayout.headline,
      text: nextCopy.headline,
    },
    supportingText: {
      ...input.overlayLayout.supportingText,
      text: nextCopy.supportingText,
    },
    cta: {
      ...input.overlayLayout.cta,
      text: nextCopy.cta,
    },
  };

  return fitOverlayLayoutToCopy(
    {
      layout: input.currentLayout,
      hook: nextCopy.hook,
      headline: nextCopy.headline,
      supportingText: nextCopy.supportingText,
      cta: nextCopy.cta,
    },
    input.aspectRatio,
    synced,
  );
};

const buildLayoutBudgetGuidance = () =>
  [
    "Layout-fit copy budgets (important: keep copy inside these limits so it fits the canvas cleanly):",
    `- hero-quote: hook <= ${LAYOUT_COPY_BUDGETS["hero-quote"].hook} chars, headline <= ${LAYOUT_COPY_BUDGETS["hero-quote"].headline}, supportingText <= ${LAYOUT_COPY_BUDGETS["hero-quote"].supportingText}, CTA optional and <= ${LAYOUT_COPY_BUDGETS["hero-quote"].cta}.`,
    `- split-story: hook <= ${LAYOUT_COPY_BUDGETS["split-story"].hook} chars, headline <= ${LAYOUT_COPY_BUDGETS["split-story"].headline}, supportingText <= ${LAYOUT_COPY_BUDGETS["split-story"].supportingText}, CTA optional and <= ${LAYOUT_COPY_BUDGETS["split-story"].cta}.`,
    `- magazine: hook <= ${LAYOUT_COPY_BUDGETS.magazine.hook} chars, headline <= ${LAYOUT_COPY_BUDGETS.magazine.headline}, supportingText <= ${LAYOUT_COPY_BUDGETS.magazine.supportingText}, CTA optional and <= ${LAYOUT_COPY_BUDGETS.magazine.cta}.`,
    `- minimal-logo: hook <= ${LAYOUT_COPY_BUDGETS["minimal-logo"].hook} chars, headline <= ${LAYOUT_COPY_BUDGETS["minimal-logo"].headline}, supportingText <= ${LAYOUT_COPY_BUDGETS["minimal-logo"].supportingText}, CTA optional and <= ${LAYOUT_COPY_BUDGETS["minimal-logo"].cta}.`,
    "- If a CTA does not fit the brief or the instruction says to avoid it, return an empty string for cta.",
  ].join("\n");

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
          ? "Close with the clearest takeaway"
          : "Deliver one clear proof point",
    headline:
      index === 0
        ? `${theme} without the fluff`
        : index === limit - 1
          ? "What should they remember?"
          : `Proof point ${index}`,
    body:
      index === 0
        ? `Start with the strongest insight for ${audience.toLowerCase()}.`
        : index === limit - 1
          ? "Leave the audience with one practical takeaway they can act on."
          : "Keep each slide to one idea, one visual, one short sentence.",
    assetHint: index === 0 ? "Hero product shot" : index === limit - 1 ? "Lifestyle close" : "Detail or context shot",
  }));
};

const deriveObjectiveCta = (objective: string) => {
  const text = objective.toLowerCase();

  if (text.includes("profile")) return "Visit profile";
  if (text.includes("call") || text.includes("demo")) return "Book a call";
  if (text.includes("lead")) return "Get in touch";
  if (text.includes("subscribe") || text.includes("newsletter")) return "Subscribe";
  if (text.includes("download")) return "Download now";

  return "";
};

const describeCtaPolicy = (ctaPolicy: CtaPolicy) => {
  switch (ctaPolicy) {
    case "avoid":
      return "Avoid CTA. Keep the on-canvas CTA empty unless an explicit instruction asks to add one.";
    case "require":
      return "Require CTA. Keep a short, specific CTA that directly supports the objective.";
    default:
      return "Support objective. Use a CTA only when it directly supports the objective; editorial concepts may omit it.";
  }
};

const resolveRequiredCta = (
  objective: string,
  fallback = "",
) => {
  const candidate = fallback.trim() || deriveObjectiveCta(objective);
  return candidate || "Learn more";
};

const applyCtaPolicyToVariant = (
  variant: CreativeVariant,
  post: Pick<GenerationRequest["post"], "ctaPolicy" | "objective">,
  currentVariant?: Pick<CreativeVariant, "cta">,
): CreativeVariant => {
  if (post.ctaPolicy === "avoid") {
    return { ...variant, cta: "" };
  }

  if (post.ctaPolicy === "require" && !variant.cta.trim()) {
    return {
      ...variant,
      cta: resolveRequiredCta(post.objective, currentVariant?.cta),
    };
  }

  return variant;
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
  const derivedCta =
    request.post.ctaPolicy === "avoid"
      ? ""
      : request.post.ctaPolicy === "require"
        ? resolveRequiredCta(request.post.objective)
        : deriveObjectiveCta(request.post.objective);

  const base = {
    supportingText: `${request.post.thought} Built for ${request.post.audience.toLowerCase()} with ${request.brand.brandName}'s core voice.`,
    caption: `${request.post.thought}\n\n${request.brand.brandName} approaches ${request.post.theme.toLowerCase()} through ${request.post.objective.toLowerCase()} with a more specific point of view.`,
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
      cta: derivedCta,
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
      cta: request.post.ctaPolicy === "require" ? derivedCta : "",
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
      cta: derivedCta,
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
              "End with a clean branded sign-off or optional CTA card",
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
                visual: "Brand lockup or closing card",
                onScreenText: derivedCta || "Leave a clear final takeaway",
                editAction: "Fade in the closing frame with subtle grain",
              },
            ],
            endCardCta: derivedCta || "Learn more",
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
      "These concepts balance discovery and conversion: one bold single image for thumb-stop impact, one educational carousel for depth, and one reel-style narrative for watch-through when video is available.",
    variants: variants.map((variant) =>
      applyLayoutCopyBudget(applyCtaPolicyToVariant(variant, request.post)),
    ),
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
      response: {
        ...strict.data,
        variants: strict.data.variants.map((variant) =>
          applyLayoutCopyBudget(applyCtaPolicyToVariant(variant, request.post)),
        ),
      },
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
    return parsed.success
      ? [applyLayoutCopyBudget(applyCtaPolicyToVariant(parsed.data, request.post))]
      : [];
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

type VariantSelectionContext = {
  brand?: Pick<
    GenerationRequest["brand"],
    "brandName" | "voice" | "values" | "principles"
  >;
  post?: Pick<
    GenerationRequest["post"],
    | "theme"
    | "subject"
    | "thought"
    | "objective"
    | "audience"
    | "mood"
    | "ctaPolicy"
  >;
};

const ALIGNMENT_STOP_WORDS = new Set([
  "about",
  "actually",
  "after",
  "also",
  "because",
  "been",
  "being",
  "between",
  "build",
  "built",
  "does",
  "each",
  "feel",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "only",
  "over",
  "really",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "this",
  "through",
  "under",
  "with",
  "your",
]);

const GENERIC_ENGAGEMENT_CTA_PATTERN =
  /\b(?:save|share|bookmark|tag(?:\s+(?:a\s+friend|someone))?|send this)\b/i;
const OBJECTIVE_ENGAGEMENT_PATTERN =
  /\b(?:save|share|bookmark|comment|engagement|awareness|reach|followers?|viral)\b/i;
const MODEL_SCORE_WEIGHT = 20;

const normalizeAlignmentPhrase = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeAlignmentField = (value: string) =>
  normalizeAlignmentPhrase(value)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 4 && !ALIGNMENT_STOP_WORDS.has(token),
    );

const buildVariantAlignmentText = (variant: CreativeVariant) =>
  normalizeAlignmentPhrase(
    [
      variant.name,
      variant.hook,
      variant.headline,
      variant.supportingText,
      variant.cta,
      variant.caption,
      variant.hashtags.join(" "),
      ...(variant.carouselSlides?.flatMap((slide) => [
        slide.goal,
        slide.headline,
        slide.body,
        slide.assetHint,
      ]) ?? []),
      ...(variant.reelPlan
        ? [
            variant.reelPlan.hook,
            variant.reelPlan.coverFrameDirection,
            variant.reelPlan.audioDirection,
            variant.reelPlan.endCardCta,
            ...variant.reelPlan.editingActions,
            ...variant.reelPlan.beats.flatMap((beat) => [
              beat.visual,
              beat.onScreenText,
              beat.editAction,
            ]),
          ]
        : []),
    ].join(" "),
  );

const scoreBriefFieldAlignment = (
  variantText: string,
  variantTokens: Set<string>,
  value: string,
  weight: number,
) => {
  const normalizedValue = normalizeAlignmentPhrase(value);
  if (!normalizedValue) {
    return 0;
  }

  if (normalizedValue.length >= 10 && variantText.includes(normalizedValue)) {
    return weight;
  }

  const tokens = tokenizeAlignmentField(value);
  if (tokens.length === 0) {
    return 0;
  }

  if (variantTokens.size === 0) {
    return 0;
  }

  const matchedTokens = new Set(tokens.filter((token) => variantTokens.has(token)))
    .size;
  if (matchedTokens === 0) {
    return 0;
  }

  const ratio = matchedTokens / tokens.length;
  const multiTokenBonus = matchedTokens >= 2 ? 0.15 : 0;
  return Math.round(weight * Math.min(1, ratio + multiTokenBonus));
};

const scoreVariantSelectionHeuristic = (
  variant: CreativeVariant,
  context?: VariantSelectionContext,
) => {
  let score = 0;
  const budget = LAYOUT_COPY_BUDGETS[variant.layout];

  const captionLen = variant.caption.length;
  if (captionLen >= 100 && captionLen <= 500) {
    score += 2;
  } else if (captionLen >= 40) {
    score += 1;
  }

  if (variant.hook.length <= budget.hook) {
    score += 1;
  }
  if (variant.headline.length <= budget.headline) {
    score += 2;
  }
  if (variant.supportingText.length <= budget.supportingText) {
    score += 2;
  }
  if (!variant.cta || variant.cta.length <= budget.cta) {
    score += 1;
  }

  if (/\d/.test(variant.hook) || variant.hook.includes("?")) {
    score += 1;
  }

  if (variant.hashtags.length >= 7 && variant.hashtags.length <= 10) {
    score += 1;
  }

  if (!context?.post) {
    return score;
  }

  const variantText = buildVariantAlignmentText(variant);
  const variantTokens = new Set(tokenizeAlignmentField(variantText));
  score += scoreBriefFieldAlignment(variantText, variantTokens, context.post.theme, 6);
  score += scoreBriefFieldAlignment(
    variantText,
    variantTokens,
    context.post.subject,
    8,
  );
  score += scoreBriefFieldAlignment(
    variantText,
    variantTokens,
    context.post.thought,
    8,
  );
  score += scoreBriefFieldAlignment(
    variantText,
    variantTokens,
    context.post.audience,
    4,
  );
  score += scoreBriefFieldAlignment(
    variantText,
    variantTokens,
    context.post.objective,
    4,
  );
  score += scoreBriefFieldAlignment(variantText, variantTokens, context.post.mood, 2);

  if (context.post.ctaPolicy === "avoid") {
    score += variant.cta.trim() ? -4 : 3;
  } else if (context.post.ctaPolicy === "require") {
    score += variant.cta.trim() ? 3 : -4;
  }

  if (
    GENERIC_ENGAGEMENT_CTA_PATTERN.test(`${variant.cta} ${variant.caption}`) &&
    !OBJECTIVE_ENGAGEMENT_PATTERN.test(context.post.objective)
  ) {
    score -= 3;
  }

  return score;
};

export const selectTopVariants = (
  variants: CreativeVariant[],
  targetCount = 3,
  context?: VariantSelectionContext,
): CreativeVariant[] => {
  if (variants.length <= targetCount) {
    return variants;
  }

  const scored = variants.map((variant) => {
    return { variant, score: scoreVariantSelectionHeuristic(variant, context) };
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
  brand: { brandName: string; voice: string; values: string; principles: string },
  post: {
    theme: string;
    subject: string;
    thought: string;
    audience: string;
    objective: string;
    mood: string;
    ctaPolicy: CtaPolicy;
  },
  customInstructions?: string,
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
      "You are an Instagram content quality judge. The saved brief is the highest-priority constraint. Score each variant on a 1-10 scale. Evaluate in this order: brief alignment (theme, subject, core thought, audience, objective, mood), brand voice/principles alignment, layout fit, hook strength, and then engagement potential. Penalize generic Instagram tropes or save/share CTA language when they drift away from the brief or stated objective. Return strict JSON only.",
    signal,
    userPrompt: `Score these Instagram creative variants for the brand "${brand.brandName}".

Brand context:
- Voice: ${brand.voice}
- Values: ${brand.values}
- Principles: ${brand.principles}

Saved post brief:
- Theme: ${post.theme}
- Subject: ${post.subject}
- Core thought: ${post.thought}
- Audience: ${post.audience}
- Objective: ${post.objective}
- Mood: ${post.mood}
- CTA policy: ${describeCtaPolicy(post.ctaPolicy)}
${customInstructions?.trim() ? `\nSaved campaign instructions:\n${customInstructions.trim()}\n` : ""}
Judge a variant strongest when it clearly expresses the saved subject and core thought for the stated audience, even if it avoids generic engagement formulas.

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
  context?: VariantSelectionContext,
): CreativeVariant[] => {
  const scoreMap = new Map(scores.map((s) => [s.id, s]));

  // Attach scores to variants
  const withScores = variants.map((v) => {
    const s = scoreMap.get(v.id);
    const heuristicScore = scoreVariantSelectionHeuristic(v, context);
    return {
      variant: { ...v, score: s?.score, scoreRationale: s?.rationale },
      score: (s?.score ?? 0) * MODEL_SCORE_WEIGHT + heuristicScore,
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
    ? `Supporting website-derived style cues (use only if they reinforce the saved brief):\n${options.websiteStyleContext}\n`
    : "";
  const websiteBodyBlock = options?.websiteBodyText
    ? `Supporting website body content (use only for brand voice and messaging context, not to override the brief):\n${options.websiteBodyText}\n`
    : "";
  const performanceBlock = options?.performanceContext
    ? `Supporting performance context (learn from it without overriding the saved brief):\n${options.performanceContext}\n`
    : "";
  const customInstructionBlock = request.promptConfig?.customInstructions?.trim()
    ? `Custom user instructions:\n${request.promptConfig.customInstructions.trim()}\n`
    : "";
  const layoutBudgetBlock = `${buildLayoutBudgetGuidance()}\n`;
  const briefPriorityBlock = `Priority order for this task:
1. Saved post brief and custom user instructions
2. Brand voice, values, principles, and story
3. Supporting website and performance context
4. Best-practice guidance and reference examples

Interpret the saved brief this way:
- Theme = overall topic arena: ${request.post.theme}
- Subject = the specific angle this post must be about: ${request.post.subject}
- Core thought = the point of view or claim the post must express: ${request.post.thought}
- Audience = who the copy should feel written for: ${request.post.audience}
- Objective = the desired next step or outcome: ${request.post.objective}
- Mood = the tonal/aesthetic direction to preserve: ${request.post.mood}
- CTA policy = ${describeCtaPolicy(request.post.ctaPolicy)}

Do not let website cues, best-practice tips, or reference examples override the saved brief. Avoid generic growth-marketing language unless the brief itself calls for it.
`;

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
Post brief:
- Theme: ${request.post.theme}
- Subject: ${request.post.subject}
- Core thought: ${request.post.thought}
- Objective: ${request.post.objective}
- Audience: ${request.post.audience}
- Mood: ${request.post.mood}
- CTA policy: ${describeCtaPolicy(request.post.ctaPolicy)}
- Preferred canvas: ${request.post.aspectRatio}

${customInstructionBlock}${briefPriorityBlock}${websiteStyleBlock}${websiteBodyBlock}${performanceBlock}Available assets (${request.assets.length}; images=${imageCount}, videos=${videoCount}):
${assetList.join("\n")}
Has logo available: ${request.hasLogo ? "yes" : "no"}

Supporting guidance (secondary to the saved brief):
${buildPromptBestPracticeContext(wineBrand)}
${layoutBudgetBlock}
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
- cta may be an empty string if the brief or instructions call for no CTA. If present, keep it short and specific.
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
- CTA policy for this brief: ${describeCtaPolicy(request.post.ctaPolicy)}
- Avoid generic language and avoid emojis.
- Output JSON only.`;
};

export const buildRefineSystemPrompt = (
  promptConfig?: Partial<PromptConfig> | null,
): string => {
  const base =
    "You refine Instagram creative variants. Apply the user's refinement instruction while preserving the current strategy, postType, layout, asset sequence, and overall on-canvas feel unless the user explicitly asks for a broader change. Return strict JSON only.";
  const customSystem = (promptConfig?.systemPrompt || "").trim();

  if (!customSystem) {
    return base;
  }

  return `${base}\n\nRelevant generation system addendum:\n${customSystem}`;
};

export const buildRefineUserPrompt = (input: {
  variant: CreativeVariant;
  instruction: string;
  brand: GenerationRequest["brand"];
  post?: GenerationRequest["post"];
  promptConfig?: Partial<PromptConfig> | null;
  overlayLayout?: OverlayLayout | null;
  instructionPlan?: RefinementPlan;
}): string => {
  const briefBlock = input.post
    ? `Original post brief:
- Theme: ${input.post.theme}
- Subject: ${input.post.subject}
- Core thought: ${input.post.thought}
- Objective: ${input.post.objective}
- Audience: ${input.post.audience}
- Mood: ${input.post.mood}
- CTA policy: ${describeCtaPolicy(input.post.ctaPolicy)}
- Preferred canvas: ${input.post.aspectRatio}
`
    : "";
  const customInstructionBlock = input.promptConfig?.customInstructions?.trim()
    ? `Saved campaign instructions:
${input.promptConfig.customInstructions.trim()}
`
    : "";
  const overlayLayoutBlock = input.overlayLayout
    ? `Current overlay layout JSON:
${JSON.stringify(input.overlayLayout, null, 2)}
`
    : "";
  const budget = LAYOUT_COPY_BUDGETS[input.variant.layout];
  const instructionPlan =
    input.instructionPlan ??
    deriveRefinementPlan(
      input.instruction,
      input.variant,
      input.post?.ctaPolicy,
    );
  const directiveBlock = buildRefinementPlanBlock(instructionPlan);

  return `Refine this Instagram creative variant according to the instruction below.

Brand:
- Name: ${input.brand.brandName}
- Voice: ${input.brand.voice}
- Values: ${input.brand.values}
- Principles: ${input.brand.principles}

${briefBlock}${customInstructionBlock}Current variant:
${JSON.stringify(input.variant, null, 2)}

${overlayLayoutBlock}Layout-fit priorities for ${input.variant.layout}:
- hook <= ${budget.hook} chars
- headline <= ${budget.headline} chars
- supportingText <= ${budget.supportingText} chars
- cta optional and <= ${budget.cta} chars

${directiveBlock}Refinement instruction: "${input.instruction}"

Refinement rules:
- Preserve postType, layout, assetSequence, and overall visual direction unless the user explicitly asks to change them.
- Use the parsed refinement plan above as the structured interpretation of the instruction.
- Keep the variant tightly aligned to the original brief when that context is provided.
- If the instruction asks for shorter text, prioritize shortening hook, headline, supportingText, and cta before changing the concept.
- If the instruction says to avoid CTA, remove CTA, or keep the post purely editorial, set "cta" to an empty string.
- Saved CTA policy: ${input.post ? describeCtaPolicy(input.post.ctaPolicy) : "Use CTA only when it directly supports the objective."}
- Only change fields that need to change to satisfy the instruction or keep the variant coherent.

Return the refined variant as a single JSON object with the exact same schema. Output JSON only.`;
};
