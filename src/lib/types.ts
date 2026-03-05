import type { AspectRatio } from "@/lib/creative";
import type { LlmProvider, MultiModelMode } from "@/lib/llm-constants";

export type UploadStatus = "uploading" | "uploaded" | "local" | "failed";
export type AssetMediaType = "image" | "video";

export type LocalAsset = {
  id: string;
  name: string;
  mediaType: AssetMediaType;
  previewUrl: string;
  posterUrl?: string;
  storageUrl?: string;
  status: UploadStatus;
  durationSec?: number;
  width?: number;
  height?: number;
  size?: number;
  error?: string;
};

export type BrandState = {
  brandName: string;
  website: string;
  values: string;
  principles: string;
  story: string;
  voice: string;
  visualDirection: string;
  palette: string;
  fonts: string;
  logoNotes: string;
};

export type PostState = {
  theme: string;
  subject: string;
  thought: string;
  objective: string;
  audience: string;
  mood: string;
  aspectRatio: AspectRatio;
};

export type InstagramAuthStatus = {
  connected: boolean;
  source: "oauth" | "env" | null;
  account?: {
    connectionId?: string;
    instagramUserId: string;
    instagramUsername?: string;
    instagramName?: string;
    pageName?: string;
    tokenExpiresAt?: string;
  };
  detail?: string;
};

export type LlmAuthStatus = {
  connected: boolean;
  source: "connection" | "env" | null;
  provider?: LlmProvider;
  model?: string;
  detail?: string;
};

export type LlmConnectionStatus = {
  id: string;
  source: "connection" | "env";
  provider: LlmProvider;
  model: string;
  connected: boolean;
  removable: boolean;
  detail?: string;
};

export type LlmMultiAuthStatus = {
  connections: LlmConnectionStatus[];
  mode: MultiModelMode;
  connected: boolean;
  // Legacy compat fields (from first connection)
  source?: "connection" | "env" | null;
  provider?: LlmProvider;
  model?: string;
};

export type PromptConfigState = {
  systemPrompt: string;
  customInstructions: string;
};

export type WorkspaceAuthStatus = {
  authenticated: boolean;
  user?: {
    email: string;
    name?: string;
    domain: string;
    expiresAt: string;
  };
};

export const INITIAL_BRAND: BrandState = {
  brandName: "Nexa Labs",
  website: "",
  values: "Radical clarity, measurable impact, craft quality, customer empathy",
  principles:
    "No fluff. Show proof. Build trust with transparent language and intentional design.",
  story:
    "Nexa Labs helps founders transform messy growth into repeatable systems through design, AI, and strategic execution.",
  voice: "Confident, direct, data-informed, warm but never corporate",
  visualDirection:
    "Bold editorial layouts, high contrast, cinematic shadows, kinetic angles, premium texture",
  palette: "#0F172A, #F97316, #F8FAFC, #22C55E",
  fonts: "",
  logoNotes: "Keep logo visible but subtle, preferably top-left chip",
};

export const INITIAL_POST: PostState = {
  theme: "Category authority",
  subject: "How high-growth teams design trust",
  thought:
    "Trust is not a slogan. It is the result of repeated proof moments that users can feel in every interaction.",
  objective: "Drive profile visits and inbound strategy calls",
  audience: "Startup founders and growth leads",
  mood: "High-energy and premium",
  aspectRatio: "4:5",
};

export const RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "4:5", label: "Feed Max (4:5)" },
  { value: "9:16", label: "Story/Reel (9:16)" },
];
