import { z } from "zod";

export const AspectRatioSchema = z.enum(["1:1", "4:5", "9:16"]);

export const BrandInputSchema = z.object({
  brandName: z.string().trim().min(2).max(80),
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

export const AssetDescriptorSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(160),
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

export type CreativeLayout = z.infer<typeof LayoutSchema>;

export const CreativeVariantSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(3).max(42),
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
});

export const GenerationResponseSchema = z.object({
  strategy: z.string().trim().min(30).max(500),
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

export const createFallbackResponse = (
  request: GenerationRequest,
): GenerationResponse => {
  const colors = paletteToHex(request.brand.palette);
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

  const hashtags = Array.from(new Set(tagPool.map(toTag))).slice(0, 8);

  const base = {
    supportingText: `${request.post.thought} Built for ${request.post.audience.toLowerCase()} with ${request.brand.brandName}'s core voice.`,
    caption: `${request.post.thought}\n\n${request.brand.brandName} turns ${request.post.theme.toLowerCase()} into a clear action: ${request.post.objective}. Save this post and share it with your team.`,
    hashtags,
    colorHexes: colors.slice(0, 3),
  };

  const variants: GenerationResponse["variants"] = [
    {
      id: "variant-a",
      name: "Impact Hero",
      hook: `${request.post.theme}: a sharper way to lead the conversation.`,
      headline: `${request.post.subject} that actually moves people`,
      cta: `Take the next step: ${request.post.objective}`,
      layout: "hero-quote",
      textAlign: "left",
      overlayStrength: 0.58,
      ...base,
    },
    {
      id: "variant-b",
      name: "Story Split",
      hook: `From idea to action in one visual story`,
      headline: `${request.post.theme} built on real principles`,
      cta: `Comment "PLAN" to get the framework`,
      layout: "split-story",
      textAlign: "left",
      overlayStrength: 0.5,
      ...base,
    },
    {
      id: "variant-c",
      name: "Minimal Authority",
      hook: `Simple design. Strong conviction.`,
      headline: `${request.brand.brandName} on ${request.post.theme}`,
      cta: `Save for your next content sprint`,
      layout: "minimal-logo",
      textAlign: "center",
      overlayStrength: 0.42,
      ...base,
    },
  ];

  return {
    strategy:
      "These three directions balance scroll-stopping contrast, concise copy blocks, and clear CTA language while preserving your brand voice and visual system.",
    variants,
  };
};

export const buildGenerationPrompt = (request: GenerationRequest): string => {
  const assetList = request.assets.map((asset, index) => `${index + 1}. ${asset.name}`);

  return `Generate 3 Instagram post creative variants as strict JSON.

Brand:
- Name: ${request.brand.brandName}
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
- Format: ${request.post.aspectRatio}

Available images (${request.assets.length}):
${assetList.join("\n")}
Has logo available: ${request.hasLogo ? "yes" : "no"}

Output constraints:
- Return JSON object with keys: strategy, variants.
- strategy: one concise rationale string.
- variants: exactly 3 objects.
- each variant fields: id, name, hook, headline, supportingText, cta, caption, hashtags, layout, textAlign, colorHexes, overlayStrength.
- layout must be one of hero-quote, split-story, magazine, minimal-logo.
- textAlign must be left or center.
- colorHexes must be 2-4 valid hex colors.
- hashtags 5-12 items with # prefix.
- Make each variant materially different and conversion-focused.
- Avoid generic language and avoid emojis.
- Output JSON only.`;
};
