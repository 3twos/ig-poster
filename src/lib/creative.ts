import { z } from "zod";

import {
  buildPromptBestPracticeContext,
  isWineBrandSignals,
} from "@/lib/instagram-playbook";

export const AspectRatioSchema = z.enum(["1:1", "4:5", "9:16"]);

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
});

export const GenerationResponseSchema = z.object({
  strategy: z.string().trim().min(30).max(800),
  variants: z.array(CreativeVariantSchema).length(3),
});

export const OverlayBlockSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(5).max(100),
  height: z.number().min(5).max(100),
  fontScale: z.number().min(0.6).max(2.4),
});

export const OverlayLayoutSchema = z.object({
  hook: OverlayBlockSchema,
  headline: OverlayBlockSchema,
  supportingText: OverlayBlockSchema,
  cta: OverlayBlockSchema,
});

export type AspectRatio = z.infer<typeof AspectRatioSchema>;
export type GenerationRequest = z.infer<typeof GenerationRequestSchema>;
export type CreativeVariant = z.infer<typeof CreativeVariantSchema>;
export type GenerationResponse = z.infer<typeof GenerationResponseSchema>;
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>;

const OVERLAY_DEFAULTS: Record<CreativeLayout, OverlayLayout> = {
  "hero-quote": {
    hook: { x: 8, y: 58, width: 72, height: 8, fontScale: 1 },
    headline: { x: 8, y: 66, width: 80, height: 16, fontScale: 1 },
    supportingText: { x: 8, y: 82, width: 84, height: 12, fontScale: 1 },
    cta: { x: 8, y: 93, width: 64, height: 6, fontScale: 1 },
  },
  "split-story": {
    hook: { x: 6, y: 60, width: 56, height: 7, fontScale: 1 },
    headline: { x: 6, y: 67, width: 58, height: 14, fontScale: 1 },
    supportingText: { x: 6, y: 81, width: 58, height: 11, fontScale: 1 },
    cta: { x: 6, y: 92, width: 56, height: 6, fontScale: 1 },
  },
  magazine: {
    hook: { x: 6, y: 72, width: 72, height: 7, fontScale: 1 },
    headline: { x: 6, y: 79, width: 84, height: 12, fontScale: 1 },
    supportingText: { x: 6, y: 90, width: 84, height: 8, fontScale: 1 },
    cta: { x: 6, y: 96, width: 56, height: 5, fontScale: 1 },
  },
  "minimal-logo": {
    hook: { x: 18, y: 24, width: 64, height: 8, fontScale: 1 },
    headline: { x: 10, y: 34, width: 80, height: 22, fontScale: 1 },
    supportingText: { x: 16, y: 56, width: 68, height: 16, fontScale: 1 },
    cta: { x: 26, y: 74, width: 48, height: 8, fontScale: 1 },
  },
};

export const createDefaultOverlayLayout = (layout: CreativeLayout): OverlayLayout => ({
  hook: { ...OVERLAY_DEFAULTS[layout].hook },
  headline: { ...OVERLAY_DEFAULTS[layout].headline },
  supportingText: { ...OVERLAY_DEFAULTS[layout].supportingText },
  cta: { ...OVERLAY_DEFAULTS[layout].cta },
});

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
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "");
  return `#${condensed.slice(0, 24) || "Instagram"}`;
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
          ? "Ready to taste the difference?"
          : `Proof point ${index}`,
    body:
      index === 0
        ? `Start with the strongest insight for ${audience.toLowerCase()}.`
        : index === limit - 1
          ? "Save this framework and share it with someone planning their next wine purchase."
          : "Keep each slide to one idea, one visual, one short sentence.",
    assetHint: index === 0 ? "Hero bottle/label" : index === limit - 1 ? "Lifestyle close" : "Vineyard detail",
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
      hook: "From vineyard to glass in clear steps",
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
            hook: `In 18 seconds: why ${request.brand.brandName} wines stand out`,
            coverFrameDirection: "Use a crisp bottle + vineyard background with high-contrast headline",
            audioDirection: "Warm cinematic indie track with subtle build",
            editingActions: [
              "Start with fastest-motion pour within first 1.2 seconds",
              "Cut every 1.8-2.4 seconds",
              "Mix wide vineyard scene, cellar closeup, glass pour macro",
              "Use bold captions centered in safe area",
              "End with tasting-room CTA card",
            ],
            beats: [
              {
                atSec: 0,
                visual: "Fast bottle uncork + pour",
                onScreenText: `Why ${request.brand.brandName}?`,
                editAction: "Hard cut + 105% zoom",
              },
              {
                atSec: 4,
                visual: "Vineyard row tracking shot",
                onScreenText: "Estate-grown fruit",
                editAction: "Speed ramp then stabilize",
              },
              {
                atSec: 8,
                visual: "Cellar barrel detail",
                onScreenText: "Precision aging",
                editAction: "Match cut on circular shapes",
              },
              {
                atSec: 13,
                visual: "Wine glass swirl and tasting moment",
                onScreenText: "Balanced and expressive",
                editAction: "Slow motion at 80% speed",
              },
              {
                atSec: 16,
                visual: "Brand lockup + CTA card",
                onScreenText: "Book a tasting",
                editAction: "Fade in CTA with subtle grain",
              },
            ],
            endCardCta: "Visit profile and book your vineyard tasting",
          }
        : imageAssets.length >= 3
          ? undefined
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

export const buildGenerationPrompt = (
  request: GenerationRequest,
  options?: {
    websiteStyleContext?: string;
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

  return `Generate 3 Instagram post creative variants as strict JSON.

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
${websiteStyleBlock}

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

Output constraints:
- Return JSON object with keys: strategy, variants.
- strategy: concise rationale focused on reach + conversion.
- variants: exactly 3 objects.
- each variant fields: id, name, postType, hook, headline, supportingText, cta, caption, hashtags, layout, textAlign, colorHexes, overlayStrength, assetSequence, carouselSlides, reelPlan.
- postType must be one of single-image, carousel, reel.
- layout must be one of hero-quote, split-story, magazine, minimal-logo.
- textAlign must be left or center.
- colorHexes must be 2-4 valid hex colors.
- hashtags must be 5-12 items with # prefix.
- assetSequence: asset ids only, 1-10 items.
- If postType=carousel, include carouselSlides with 3-10 slides and each slide must include index, goal, headline, body, assetHint.
- If postType=reel, include reelPlan with targetDurationSec, hook, coverFrameDirection, audioDirection, editingActions (4-10), beats (3-12), endCardCta.
- If videoCount > 0, at least one variant must be postType=reel.
- If imageCount >= 3, at least one variant must be postType=carousel.
- For wine/alcohol brands: avoid unsafe or non-compliant alcohol messaging.
- Avoid generic language and avoid emojis.
- Output JSON only.`;
};
