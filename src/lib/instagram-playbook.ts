type BrandInputLike = {
  brandName: string;
  website?: string;
  values: string;
  story: string;
  voice: string;
  visualDirection: string;
};

type PostInputLike = {
  theme: string;
  subject: string;
  thought: string;
};

export const OFFICIAL_BEST_PRACTICE_NOTES = [
  "Recommendation eligibility drives non-follower discovery (Explore/Reels/Feed recommendations).",
  "Professional accounts should keep Account Status healthy to stay recommendation-eligible.",
  "Instagram has an in-app Best Practices hub focused on creation, engagement, reach, monetization, and guidelines.",
  "Content Publishing API supports carousel posts of up to 10 media items and counts a carousel as a single publish event.",
  "Reels publishing via API uses media_type=REELS and can be configured to share to feed.",
] as const;

export const VIDEO_EDIT_HEURISTICS = [
  "Front-load the hook in the first 1.5 seconds with motion and a clear text promise.",
  "Use short beat changes every 1.5-3.0 seconds to maintain retention.",
  "Design with no-audio viewing in mind: concise on-screen captions and high contrast text.",
  "End with one explicit CTA tied to save/share/comment/profile visit intent.",
  "For vineyard/wine visuals, alternate product closeups with place-based footage (vines, cellar, pour, pairing).",
] as const;

export const ENGAGEMENT_PATTERNS = [
  "Hook formula: open with a bold claim, contradiction, or specific number in the first line of the caption.",
  "CTA patterns that drive saves: 'Save this for your next [X]', 'Bookmark this framework', 'Come back to this before your next [action]'.",
  "CTA patterns that drive shares: 'Tag someone who needs this', 'Send this to your [role/friend]'.",
  "Caption structure: Hook line, then 2-3 value lines, then bridge to CTA, then CTA, then hashtag block. Keep whitespace between sections.",
  "Carousel authority pattern: first slide = bold promise or question, middle slides = proof/steps/stats, last slide = CTA + brand logo.",
  "Reel retention: pattern interrupt every 2-3 seconds, text reveals timed to cuts, end with a loop or cliffhanger to boost replays.",
  "Specificity wins: '3 signs your growth strategy is working' beats 'tips for better growth'. Use concrete numbers and outcomes.",
] as const;

export const FEW_SHOT_VARIANT_EXAMPLE = `Example of a strong single-image variant (for quality reference only — do not copy content):
{"id":"ex-1","name":"Authority Proof","postType":"single-image","hook":"3 signs your growth strategy is actually working","headline":"Proof over promises","supportingText":"Most brands track vanity metrics. Here is what actually moves revenue for teams that measure what matters.","cta":"Save this checklist for your next strategy review","caption":"3 signs your growth strategy is actually working\\n\\nMost brands obsess over follower count.\\nBut the teams winning right now track three things:\\n\\n1. Repeat engagement rate\\n2. Save-to-impression ratio\\n3. Profile visits from non-followers\\n\\nSave this post and revisit it before your next planning sprint.","hashtags":["#GrowthStrategy","#StartupMarketing","#BrandBuilding","#ContentThatConverts","#MarketingTips","#SocialMediaStrategy"],"layout":"hero-quote","textAlign":"left","colorHexes":["#0F172A","#F97316","#FFFFFF"],"overlayStrength":0.55,"assetSequence":["asset-1"]}` as const;

export const VINEYARD_MARKETING_GUARDRAILS = [
  "Target legal-drinking-age audiences only and use age-appropriate creative.",
  "Do not frame alcohol as a cure, performance enhancer, or social necessity.",
  "Avoid intoxication cues, unsafe behavior, or copy that encourages excessive consumption.",
  "If influencer or paid partnerships are involved, include clear disclosure language (for example #ad or #sponsored).",
] as const;

const WINE_TERMS =
  /\bwine\b|\bwinery\b|\bvineyard\b|\bvines?\b|\bgrape\b|\bpinot\b|\bcabernet\b|\bsauvignon\b|\bros[eé]\b|\bsommelier\b|\bcellar\b|\bmerlot\b|\bchardonnay\b/i;

export const isWineBrandSignals = (
  brand: BrandInputLike,
  post: PostInputLike,
) => {
  const combined = [
    brand.brandName,
    brand.website ?? "",
    brand.values,
    brand.story,
    brand.voice,
    brand.visualDirection,
    post.theme,
    post.subject,
    post.thought,
  ]
    .join(" ")
    .toLowerCase();

  return WINE_TERMS.test(combined);
};

export const buildPromptBestPracticeContext = (isWineBrand: boolean) => {
  const sections = [
    "Instagram best-practice constraints:",
    ...OFFICIAL_BEST_PRACTICE_NOTES.map((note) => `- ${note}`),
    "Engagement pattern guidance:",
    ...ENGAGEMENT_PATTERNS.map((note) => `- ${note}`),
    "Video editing constraints:",
    ...VIDEO_EDIT_HEURISTICS.map((note) => `- ${note}`),
  ];

  if (isWineBrand) {
    sections.push(
      "Wine/vineyard compliance constraints:",
      ...VINEYARD_MARKETING_GUARDRAILS.map((note) => `- ${note}`),
    );
  }

  sections.push("", "Reference example (for quality and structure guidance):", FEW_SHOT_VARIANT_EXAMPLE);

  return sections.join("\n");
};
