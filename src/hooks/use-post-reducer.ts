import type { GenerationResponse, OverlayLayout } from "@/lib/creative";
import type { MediaComposition } from "@/lib/media-composer";
import type { StoredAsset } from "@/lib/project";
import type {
  BrandState,
  PostState,
  PromptConfigState,
  PublishSettingsState,
} from "@/lib/types";
import { INITIAL_PUBLISH_SETTINGS } from "@/lib/types";
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
  mediaComposition: MediaComposition;
  publishSettings: PublishSettingsState;
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
  | { type: "SET_ASSETS"; assets: StoredAsset[]; postId?: string }
  | { type: "SET_MEDIA_COMPOSITION"; mediaComposition: MediaComposition; postId?: string }
  | {
      type: "SET_PUBLISH_SETTINGS";
      publishSettings: Partial<PublishSettingsState>;
      postId?: string;
    }
  | { type: "ADD_ASSET"; asset: StoredAsset }
  | { type: "SET_LOGO"; logoUrl: string | null; postId?: string }
  | { type: "SET_PROMPT_CONFIG"; config: Partial<PromptConfigState> }
  | {
      type: "SET_RESULT";
      postId?: string;
      result: GenerationResponse;
      overlayLayouts: Record<string, OverlayLayout>;
    }
  | { type: "SET_ACTIVE_VARIANT"; variantId: string; postId?: string }
  | {
      type: "UPDATE_OVERLAY";
      postId?: string;
      variantId: string;
      layout: OverlayLayout;
    }
  | { type: "SET_ACTIVE_SLIDE"; index: number }
  | { type: "SET_SHARE"; shareUrl: string; shareProjectId?: string; postId?: string }
  | { type: "SET_RENDERED_POSTER"; url: string }
  | { type: "ADD_PUBLISH"; entry: PublishHistoryEntry; postId?: string }
  | { type: "SET_STATUS"; status: string; postId?: string }
  | {
      type: "SET_BRAND_KIT";
      postId?: string;
      brandKitId: string;
      brand: Partial<BrandState>;
      logoUrl?: string | null;
      promptConfig?: Partial<PromptConfigState> | null;
    };

function matchesOwnedAction(
  state: PostDraft | null,
  action: { postId?: string },
): state is PostDraft {
  return state !== null && (!action.postId || state.id === action.postId);
}

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
    mediaComposition: row.mediaComposition ?? { orientation: "portrait", items: [] },
    publishSettings: {
      ...INITIAL_PUBLISH_SETTINGS,
      ...(row.publishSettings ?? {}),
    },
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
      if (!matchesOwnedAction(state, action)) return state;
      return { ...state, assets: action.assets };

    case "SET_MEDIA_COMPOSITION":
      if (!matchesOwnedAction(state, action)) return state;
      return { ...state, mediaComposition: action.mediaComposition };

    case "SET_PUBLISH_SETTINGS":
      if (!matchesOwnedAction(state, action)) return state;
      return {
        ...state,
        publishSettings: {
          ...state.publishSettings,
          ...action.publishSettings,
        },
      };

    case "ADD_ASSET":
      if (!state) return state;
      return { ...state, assets: [...state.assets, action.asset] };

    case "SET_LOGO":
      if (!matchesOwnedAction(state, action)) return state;
      return { ...state, logoUrl: action.logoUrl };

    case "SET_PROMPT_CONFIG":
      if (!state) return state;
      return {
        ...state,
        promptConfig: { ...(state.promptConfig ?? {}), ...action.config },
      };

    case "SET_RESULT":
      if (!matchesOwnedAction(state, action)) return state;
      return {
        ...state,
        result: action.result,
        overlayLayouts: { ...state.overlayLayouts, ...action.overlayLayouts },
        status: state.status === "draft" ? "generated" : state.status,
      };

    case "SET_ACTIVE_VARIANT":
      if (!matchesOwnedAction(state, action)) return state;
      return { ...state, activeVariantId: action.variantId };

    case "UPDATE_OVERLAY":
      if (!matchesOwnedAction(state, action)) return state;
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
      if (!matchesOwnedAction(state, action)) return state;
      return {
        ...state,
        shareUrl: action.shareUrl,
        shareProjectId: action.shareProjectId ?? state.shareProjectId,
      };

    case "SET_RENDERED_POSTER":
      if (!state) return state;
      return { ...state, renderedPosterUrl: action.url };

    case "ADD_PUBLISH":
      if (!matchesOwnedAction(state, action)) return state;
      return {
        ...state,
        publishHistory: [...state.publishHistory, action.entry],
        status: "published",
      };

    case "SET_STATUS":
      if (!matchesOwnedAction(state, action)) return state;
      return { ...state, status: action.status };

    case "SET_BRAND_KIT":
      if (!matchesOwnedAction(state, action)) return state;
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
