import { z } from "zod";

import type { AspectRatio } from "@/lib/creative";
import { MetaUserTagSchema } from "@/lib/meta-schemas";

export const ComposerOrientationSchema = z.enum([
  "square",
  "portrait",
  "landscape",
]);

export const MediaCropRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
});

export const MediaCompositionItemSchema = z.object({
  assetId: z.string().trim().min(1),
  cropRect: MediaCropRectSchema.optional(),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]).optional(),
  excludedFromPost: z.boolean().optional(),
  coverPriority: z.number().int().min(1).max(20).optional(),
  userTags: z.array(MetaUserTagSchema).max(20).optional(),
});

export const MediaCompositionSchema = z.object({
  orientation: ComposerOrientationSchema.default("portrait"),
  items: z.array(MediaCompositionItemSchema).max(20).default([]),
});

export type ComposerOrientation = z.infer<typeof ComposerOrientationSchema>;
export type MediaCropRect = z.infer<typeof MediaCropRectSchema>;
export type MediaCompositionItem = z.infer<typeof MediaCompositionItemSchema>;
export type MediaComposition = z.infer<typeof MediaCompositionSchema>;

export const DEFAULT_MEDIA_CROP_RECT: MediaCropRect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export const DEFAULT_MEDIA_COMPOSITION: MediaComposition = {
  orientation: "portrait",
  items: [],
};

const normalizeItem = (
  item: Partial<MediaCompositionItem> & Pick<MediaCompositionItem, "assetId">,
): MediaCompositionItem => ({
  assetId: item.assetId,
  cropRect: item.cropRect ?? DEFAULT_MEDIA_CROP_RECT,
  rotation: item.rotation ?? 0,
  excludedFromPost: item.excludedFromPost ?? false,
  coverPriority: item.coverPriority,
  userTags: item.userTags?.length ? item.userTags : undefined,
});

export const orientationFromAspectRatio = (
  aspectRatio: AspectRatio,
): ComposerOrientation => {
  if (aspectRatio === "1:1") return "square";
  if (aspectRatio === "1.91:1") return "landscape";
  return "portrait";
};

export const aspectRatioFromOrientation = (
  orientation: ComposerOrientation,
): AspectRatio => {
  if (orientation === "square") return "1:1";
  if (orientation === "landscape") return "1.91:1";
  return "4:5";
};

export const reconcileMediaComposition = (
  composition: Partial<MediaComposition> | null | undefined,
  assetIds: string[],
  aspectRatio: AspectRatio,
): MediaComposition => {
  const requestedOrientation =
    composition?.orientation ?? orientationFromAspectRatio(aspectRatio);
  const byAssetId = new Map(
    (composition?.items ?? []).map((item) => [item.assetId, normalizeItem(item)]),
  );
  const seen = new Set<string>();

  const nextItems: MediaCompositionItem[] = [];
  for (const item of composition?.items ?? []) {
    if (!assetIds.includes(item.assetId) || seen.has(item.assetId)) {
      continue;
    }
    seen.add(item.assetId);
    nextItems.push(byAssetId.get(item.assetId) ?? normalizeItem(item));
  }

  for (const assetId of assetIds) {
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    nextItems.push(normalizeItem({ assetId }));
  }

  return {
    orientation: requestedOrientation,
    items: nextItems,
  };
};

export const alignMediaCompositionOrientation = (
  composition: MediaComposition,
  aspectRatio: AspectRatio,
): MediaComposition => {
  if (aspectRatio === "9:16") {
    return composition;
  }

  const orientation = orientationFromAspectRatio(aspectRatio);
  if (composition.orientation === orientation) {
    return composition;
  }

  return {
    ...composition,
    orientation,
  };
};

export const normalizeAssetSequence = (
  assetSequence: string[],
  availableAssetIds: string[],
  limit = 10,
) => {
  const availableAssetIdSet = new Set(availableAssetIds);

  return Array.from(new Set(assetSequence))
    .filter((assetId) => availableAssetIdSet.has(assetId))
    .slice(0, limit);
};

export const mediaCompositionEquals = (
  left: MediaComposition | null | undefined,
  right: MediaComposition | null | undefined,
) => JSON.stringify(left ?? DEFAULT_MEDIA_COMPOSITION) ===
  JSON.stringify(right ?? DEFAULT_MEDIA_COMPOSITION);
