import type { PostState } from "@/lib/types";

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji for visual cards
  brief: Partial<PostState>;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "product-launch",
    name: "Product Launch",
    description: "Announce a new product, feature, or collection with impact.",
    icon: "🚀",
    brief: {
      theme: "Product launch",
      objective: "Drive awareness and pre-orders / signups",
      audience: "Existing followers and potential customers",
      mood: "Exciting, premium, aspirational",
      thought: "This product exists because our audience asked for it — it solves a real problem they face every day.",
    },
  },
  {
    id: "behind-the-scenes",
    name: "Behind the Scenes",
    description: "Show the human side of your brand with BTS content.",
    icon: "🎬",
    brief: {
      theme: "Behind the scenes",
      objective: "Build trust and humanize the brand",
      audience: "Engaged followers who want to feel connected",
      mood: "Authentic, warm, candid",
      thought: "People buy from people. Showing the real work behind the brand creates emotional connection.",
    },
  },
  {
    id: "educational",
    name: "Educational / How-To",
    description: "Teach something valuable to position as an authority.",
    icon: "📚",
    brief: {
      theme: "Educational content",
      objective: "Drive saves and shares through value-packed content",
      audience: "People looking to learn and improve",
      mood: "Clear, authoritative, approachable",
      thought: "The best way to build trust is to give away knowledge freely — it positions us as the go-to expert.",
    },
  },
  {
    id: "sale-promo",
    name: "Sale / Promotion",
    description: "Drive urgency and conversions with a time-limited offer.",
    icon: "🏷️",
    brief: {
      theme: "Limited-time offer",
      objective: "Drive immediate purchases and website traffic",
      audience: "Price-sensitive followers and deal hunters",
      mood: "Urgent, exciting, exclusive",
      thought: "Scarcity and exclusivity drive action — but the offer must feel genuinely valuable, not gimmicky.",
    },
  },
  {
    id: "testimonial",
    name: "User Testimonial",
    description: "Leverage social proof from happy customers.",
    icon: "⭐",
    brief: {
      theme: "Social proof",
      objective: "Build credibility and drive conversions through trust",
      audience: "Potential customers in the consideration stage",
      mood: "Trustworthy, relatable, genuine",
      thought: "Real stories from real users are more persuasive than any marketing copy we could write.",
    },
  },
  {
    id: "seasonal",
    name: "Seasonal / Holiday",
    description: "Tap into seasonal moments and cultural events.",
    icon: "🎉",
    brief: {
      theme: "Seasonal moment",
      objective: "Increase engagement and brand relevance",
      audience: "Broad audience celebrating the season or event",
      mood: "Festive, timely, celebratory",
      thought: "Seasonal content connects our brand to moments people already care about.",
    },
  },
  {
    id: "community",
    name: "Community Spotlight",
    description: "Celebrate your community, team, or collaborators.",
    icon: "🤝",
    brief: {
      theme: "Community spotlight",
      objective: "Strengthen community bonds and encourage UGC",
      audience: "Active community members and potential new joiners",
      mood: "Warm, inclusive, celebratory",
      thought: "A brand is nothing without its community — spotlighting them builds loyalty and encourages participation.",
    },
  },
  {
    id: "thought-leadership",
    name: "Thought Leadership",
    description: "Share bold perspectives that challenge conventional thinking.",
    icon: "💡",
    brief: {
      theme: "Category authority",
      objective: "Drive profile visits and inbound inquiries",
      audience: "Industry professionals and decision-makers",
      mood: "Bold, provocative, intelligent",
      thought: "Taking a clear stance on industry issues separates leaders from followers.",
    },
  },
];
