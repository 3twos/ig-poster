import type { GenerationResponse, OverlayLayout } from "@/lib/creative";
import type { StoredAsset } from "@/lib/project";
import type { BrandState, PostState, PromptConfigState } from "@/lib/types";
import type { PostRow, PublishHistoryEntry } from "@/db/schema";

/** Client-side post state — extends DB row with transient fields */
export type PostDraft = {
  id: string;
  title: string;
  status: string;
  brand: Partial<BrandState> | null;
  brief: Partial<PostState> | null;
  assets: StoredAsset[];
  logoUrl: string | null;
  brandKitId: string | null;
  promptConfig: Partial<PromptConfigState> | null;
  result: GenerationResponse | null;
  activeVariantId: string | null;
  overlayLayouts: Record<string, OverlayLayout>;
  renderedPosterUrl: string | null;
  shareUrl: string | null;
  shareProjectId: string | null;
  publishHistory: PublishHistoryEntry[];
  // Transient (not persisted)
  activeSlideIndex: number;
};

export type PostAction =
  | { type: "LOAD_POST"; row: PostRow }
  | { type: "SET_DRAFT"; draft: PostDraft | null }
  | { type: "UPDATE_BRAND"; brand: Partial<BrandState> }
  | { type: "UPDATE_BRIEF"; brief: Partial<PostState> }
  | { type: "SET_ASSETS"; assets: StoredAsset[] }
  | { type: "ADD_ASSET"; asset: StoredAsset }
  | { type: "SET_LOGO"; logoUrl: string | null }
  | { type: "SET_PROMPT_CONFIG"; config: Partial<PromptConfigState> }
  | {
      type: "SET_RESULT";
      result: GenerationResponse;
      overlayLayouts: Record<string, OverlayLayout>;
    }
  | { type: "SET_ACTIVE_VARIANT"; variantId: string }
  | {
      type: "UPDATE_OVERLAY";
      variantId: string;
      layout: OverlayLayout;
    }
  | { type: "SET_ACTIVE_SLIDE"; index: number }
  | { type: "SET_SHARE"; shareUrl: string; shareProjectId?: string }
  | { type: "SET_RENDERED_POSTER"; url: string }
  | { type: "ADD_PUBLISH"; entry: PublishHistoryEntry }
  | { type: "SET_STATUS"; status: string }
  | { type: "SET_BRAND_KIT"; brandKitId: string; brand: Partial<BrandState>; logoUrl?: string | null; promptConfig?: Partial<PromptConfigState> | null };

export function rowToDraft(row: PostRow): PostDraft {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    brand: row.brand ?? null,
    brief: row.brief ?? null,
    assets: row.assets ?? [],
    logoUrl: row.logoUrl,
    brandKitId: row.brandKitId ?? null,
    promptConfig: row.promptConfig ?? null,
    result: row.result ?? null,
    activeVariantId: row.activeVariantId,
    overlayLayouts: row.overlayLayouts ?? {},
    renderedPosterUrl: row.renderedPosterUrl,
    shareUrl: row.shareUrl,
    shareProjectId: row.shareProjectId,
    publishHistory: row.publishHistory ?? [],
    activeSlideIndex: 0,
  };
}

export function postReducer(
  state: PostDraft | null,
  action: PostAction,
): PostDraft | null {
  switch (action.type) {
    case "LOAD_POST":
      return rowToDraft(action.row);

    case "SET_DRAFT":
      return action.draft;

    case "UPDATE_BRAND":
      if (!state) return state;
      return {
        ...state,
        brand: { ...(state.brand ?? {}), ...action.brand },
      };

    case "UPDATE_BRIEF":
      if (!state) return state;
      return {
        ...state,
        brief: { ...(state.brief ?? {}), ...action.brief },
      };

    case "SET_ASSETS":
      if (!state) return state;
      return { ...state, assets: action.assets };

    case "ADD_ASSET":
      if (!state) return state;
      return { ...state, assets: [...state.assets, action.asset] };

    case "SET_LOGO":
      if (!state) return state;
      return { ...state, logoUrl: action.logoUrl };

    case "SET_PROMPT_CONFIG":
      if (!state) return state;
      return {
        ...state,
        promptConfig: { ...(state.promptConfig ?? {}), ...action.config },
      };

    case "SET_RESULT":
      if (!state) return state;
      return {
        ...state,
        result: action.result,
        overlayLayouts: { ...state.overlayLayouts, ...action.overlayLayouts },
        status: state.status === "draft" ? "generated" : state.status,
      };

    case "SET_ACTIVE_VARIANT":
      if (!state) return state;
      return { ...state, activeVariantId: action.variantId };

    case "UPDATE_OVERLAY":
      if (!state) return state;
      return {
        ...state,
        overlayLayouts: {
          ...state.overlayLayouts,
          [action.variantId]: action.layout,
        },
      };

    case "SET_ACTIVE_SLIDE":
      if (!state) return state;
      return { ...state, activeSlideIndex: action.index };

    case "SET_SHARE":
      if (!state) return state;
      return {
        ...state,
        shareUrl: action.shareUrl,
        shareProjectId: action.shareProjectId ?? state.shareProjectId,
      };

    case "SET_RENDERED_POSTER":
      if (!state) return state;
      return { ...state, renderedPosterUrl: action.url };

    case "ADD_PUBLISH":
      if (!state) return state;
      return {
        ...state,
        publishHistory: [...state.publishHistory, action.entry],
        status: "published",
      };

    case "SET_STATUS":
      if (!state) return state;
      return { ...state, status: action.status };

    case "SET_BRAND_KIT":
      if (!state) return state;
      return {
        ...state,
        brandKitId: action.brandKitId,
        brand: { ...(state.brand ?? {}), ...action.brand },
        logoUrl: action.logoUrl !== undefined ? action.logoUrl : state.logoUrl,
        promptConfig:
          action.promptConfig !== undefined
            ? (action.promptConfig === null
                ? null
                : { ...(state.promptConfig ?? {}), ...action.promptConfig })
            : state.promptConfig,
      };

    default:
      return state;
  }
}
