"use client";

import { LayoutTemplate, Save } from "lucide-react";
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
  setEditorMode: (v: boolean) => void;
  onResetTextLayout: () => void;
  saveStatus: SaveStatus;
  onSaveNow: () => Promise<void>;
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
  setEditorMode,
  onResetTextLayout,
  saveStatus,
  onSaveNow,
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

      {/* Editor toolbar below preview */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setEditorMode(!editorMode)}
            className={cn(
              "uppercase",
              editorMode && "border-orange-300/50 bg-orange-500/15 text-orange-100",
            )}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            {editorMode ? "Editor On" : "Editor Off"}
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={!activeVariant}
            onClick={onResetTextLayout}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Reset Layout
          </Button>
        </div>
        {editorMode ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">
              {saveStatusLabel(saveStatus)}
            </Badge>
            <Button variant="outline" size="xs" onClick={() => void onSaveNow()}>
              <Save className="h-3.5 w-3.5" />
              Save now
            </Button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
