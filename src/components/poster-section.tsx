"use client";

import { motion } from "framer-motion";
import type { RefObject } from "react";

import { PosterPreview } from "@/components/poster-preview";
import type { AspectRatio, CreativeVariant, OverlayLayout } from "@/lib/creative";

type Props = {
  posterRef: RefObject<HTMLDivElement | null>;
  activeVariant: CreativeVariant | null;
  brandName: string;
  aspectRatio: AspectRatio;
  primaryVisual?: string;
  secondaryVisual?: string;
  logoImage?: string;
  editorMode: boolean;
  overlayLayout?: OverlayLayout;
  activeSlideIndex: number;
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
  overlayLayout,
  activeSlideIndex,
  dispatch,
}: Props) {
  if (!activeVariant) {
    return (
      <div className="mx-auto flex aspect-[4/5] max-w-[430px] items-center justify-center rounded-3xl border border-dashed border-white/25 bg-white/5 text-sm text-slate-300">
        Upload assets and generate concepts to preview your post.
      </div>
    );
  }

  return (
    <motion.div
      key={activeVariant.id}
      initial={{ opacity: 0.2 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-[430px]"
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
    </motion.div>
  );
}
