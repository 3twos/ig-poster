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
    "Video editing constraints:",
    ...VIDEO_EDIT_HEURISTICS.map((note) => `- ${note}`),
  ];

  if (isWineBrand) {
    sections.push(
      "Wine/vineyard compliance constraints:",
      ...VINEYARD_MARKETING_GUARDRAILS.map((note) => `- ${note}`),
    );
  }

  return sections.join("\n");
};
