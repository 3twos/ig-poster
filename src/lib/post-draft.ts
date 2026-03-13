import type { PostDraft } from "@/hooks/use-post-reducer";
import type { MetaUserTag } from "@/lib/meta-schemas";
import type { PostUpdateRequest } from "@/lib/post-schemas";

const normalizeTagUsername = (value: string) => value.trim().replace(/^@/, "");

const normalizeUserTags = (tags: MetaUserTag[] | null | undefined) => {
  const normalized = (tags ?? [])
    .map((tag) => ({
      username: normalizeTagUsername(tag.username),
      x: tag.x,
      y: tag.y,
    }))
    .filter((tag) => tag.username.length > 0);

  return normalized.length ? normalized : undefined;
};

export const buildPostUpdateRequest = (
  draft: PostDraft,
): PostUpdateRequest => ({
  title: draft.title,
  status: draft.status,
  logoUrl: draft.logoUrl,
  activeVariantId: draft.activeVariantId,
  renderedPosterUrl: draft.renderedPosterUrl,
  shareUrl: draft.shareUrl,
  shareProjectId: draft.shareProjectId,
  brandKitId: draft.brandKitId,
  brand: draft.brand,
  brief: draft.brief,
  promptConfig: draft.promptConfig,
  overlayLayouts: draft.overlayLayouts,
  mediaComposition: {
    ...draft.mediaComposition,
    items: draft.mediaComposition.items.map((item) => ({
      ...item,
      userTags: normalizeUserTags(item.userTags),
    })),
  },
  publishSettings: draft.publishSettings,
  assets: draft.assets,
  result: draft.result,
  publishHistory: draft.publishHistory,
});

export const serializePostDraft = (draft: PostDraft) =>
  JSON.stringify(buildPostUpdateRequest(draft));
