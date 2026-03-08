"use client";

import { motion } from "framer-motion";
import type { RefObject } from "react";

import { PosterPreview } from "@/components/poster-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/hooks/use-auto-save";
import type { AspectRatio, CreativeVariant, OverlayLayout } from "@/lib/creative";
import { cn } from "@/lib/utils";

function saveStatusLabel(saveStatus: SaveStatus) {
  switch (saveStatus) {
    case "saving":
      return "Saving...";
    case "unsaved":
      return "Unsaved";
    case "error":
      return "Save failed";
    default:
      return "Saved";
  }
}

type Props = {
  posterRef: RefObject<HTMLDivElement | null>;
  activeVariant: CreativeVariant | null;
  brandName: string;
  aspectRatio: AspectRatio;
  primaryVisual?: string;
  secondaryVisual?: string;
  logoImage?: string;
  editorMode: boolean;
  onResetTextLayout: () => void;
  saveStatus: SaveStatus;
  overlayLayout?: OverlayLayout;
  activeSlideIndex: number;
  previewClassName?: string;
  dispatch: (action: Record<string, unknown>) => void;
};

export function PosterSection({
  posterRef,
  activeVariant,
  brandName,
  aspectRatio,
  primaryVisual,
  secondaryVisual,
  logoImage,
  editorMode,
  onResetTextLayout,
  saveStatus,
  overlayLayout,
  activeSlideIndex,
  previewClassName,
  dispatch,
}: Props) {
  if (!activeVariant) {
    return (
      <div
        className={cn(
          "mx-auto flex aspect-[4/5] w-full max-w-[430px] items-center justify-center rounded-3xl border border-dashed border-white/25 bg-white/5 text-sm text-slate-300",
          previewClassName,
        )}
      >
        Upload assets and generate concepts to preview your post.
      </div>
    );
  }

  return (
    <motion.div
      key={activeVariant.id}
      initial={{ opacity: 0.2 }}
      animate={{ opacity: 1 }}
      className={cn("mx-auto w-full max-w-[430px]", previewClassName)}
    >
      <PosterPreview
        ref={posterRef}
        variant={activeVariant}
        brandName={brandName}
        aspectRatio={aspectRatio}
        primaryImage={primaryVisual}
        secondaryImage={secondaryVisual}
        logoImage={logoImage}
        editorMode={editorMode}
        overlayLayout={overlayLayout}
        onOverlayLayoutChange={(layout) => {
          dispatch({
            type: "UPDATE_OVERLAY",
            variantId: activeVariant.id,
            layout,
          });
        }}
        carouselSlides={activeVariant.carouselSlides}
        activeSlideIndex={activeSlideIndex}
        onSlideChange={(index: number) =>
          dispatch({ type: "SET_ACTIVE_SLIDE", index })
        }
      />

      {/* Editor controls — visible only in edit mode */}
      {editorMode ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={onResetTextLayout}
            >
              Reset Layout
            </Button>
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 uppercase">
              Corners
              <input
                type="range"
                min={0}
                max={48}
                value={overlayLayout?.hook?.borderRadius ?? 16}
                onChange={(e) => {
                  if (!overlayLayout) return;
                  const r = parseInt(e.target.value);
                  dispatch({
                    type: "UPDATE_OVERLAY",
                    variantId: activeVariant.id,
                    layout: {
                      ...overlayLayout,
                      hook: { ...overlayLayout.hook, borderRadius: r },
                      headline: { ...overlayLayout.headline, borderRadius: r },
                      supportingText: { ...overlayLayout.supportingText, borderRadius: r },
                      cta: { ...overlayLayout.cta, borderRadius: r },
                      custom: (overlayLayout.custom ?? []).map((b) => ({ ...b, borderRadius: r })),
                    },
                  });
                }}
                className="h-3 w-16 accent-orange-300"
                title={`Corner radius: ${overlayLayout?.hook?.borderRadius ?? 16}px`}
              />
            </label>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">
            {saveStatusLabel(saveStatus)}
          </Badge>
        </div>
      ) : null}
    </motion.div>
  );
}
