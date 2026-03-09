"use client";

import { motion } from "framer-motion";
import { Eye, ImageOff, Plus, Save, Type } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";

import { PosterPreview } from "@/components/poster-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/hooks/use-auto-save";
import {
  DEFAULT_LOGO_POSITION,
  type AspectRatio,
  type CanonicalOverlayKey,
  type CreativeVariant,
  type OverlayLayout,
} from "@/lib/creative";
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

const MAX_CUSTOM_TEXT_BOXES = 6;

function createCustomTextBox(count: number): OverlayLayout["custom"][number] {
  const offset = count * 4;
  return {
    id: `custom-${Date.now()}-${count}`,
    label: `Text Box ${count + 1}`,
    text: "New text",
    x: Math.min(12 + offset, 56),
    y: Math.min(14 + offset, 70),
    width: 52,
    height: 12,
    fontScale: 1,
    visible: true,
  };
}

const CANONICAL_KEYS: CanonicalOverlayKey[] = ["hook", "headline", "supportingText", "cta"];
const CANONICAL_LABELS: Record<CanonicalOverlayKey, string> = {
  hook: "Hook",
  headline: "Headline",
  supportingText: "Body",
  cta: "CTA",
};

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
  onSaveNow?: () => Promise<void>;
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
  onSaveNow,
}: Props) {
  const [showHiddenOpen, setShowHiddenOpen] = useState(false);
  const hiddenDropdownRef = useRef<HTMLDivElement>(null);

  const hiddenBlocks = useMemo(() => {
    if (!overlayLayout) return [];
    return CANONICAL_KEYS.filter((key) => !overlayLayout[key].visible);
  }, [overlayLayout]);

  const logoVisible = overlayLayout?.logo?.visible ?? true;

  const handleAddTextBox = useCallback(() => {
    if (!overlayLayout || !activeVariant) return;
    const currentCount = overlayLayout.custom?.length ?? 0;
    if (currentCount >= MAX_CUSTOM_TEXT_BOXES) return;
    dispatch({
      type: "UPDATE_OVERLAY",
      variantId: activeVariant.id,
      layout: {
        ...overlayLayout,
        custom: [...(overlayLayout.custom ?? []), createCustomTextBox(currentCount)],
      },
    });
  }, [overlayLayout, activeVariant, dispatch]);

  const handleShowBlock = useCallback(
    (key: CanonicalOverlayKey) => {
      if (!overlayLayout || !activeVariant) return;
      dispatch({
        type: "UPDATE_OVERLAY",
        variantId: activeVariant.id,
        layout: {
          ...overlayLayout,
          [key]: { ...overlayLayout[key], visible: true },
        },
      });
    },
    [overlayLayout, activeVariant, dispatch],
  );

  const handleToggleLogo = useCallback(() => {
    if (!overlayLayout || !activeVariant) return;
    dispatch({
      type: "UPDATE_OVERLAY",
      variantId: activeVariant.id,
      layout: {
        ...overlayLayout,
        logo: {
          ...(overlayLayout.logo ?? DEFAULT_LOGO_POSITION),
          visible: !logoVisible,
        },
      },
    });
  }, [overlayLayout, activeVariant, dispatch, logoVisible]);

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
            <Button
              variant="outline"
              size="xs"
              onClick={handleAddTextBox}
              disabled={!overlayLayout || (overlayLayout.custom?.length ?? 0) >= MAX_CUSTOM_TEXT_BOXES}
            >
              <Type className="h-3.5 w-3.5" />
              Add Text
            </Button>
            {hiddenBlocks.length > 0 ? (
              <div className="relative" ref={hiddenDropdownRef}>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setShowHiddenOpen((v) => !v)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Show Hidden ({hiddenBlocks.length})
                </Button>
                {showHiddenOpen ? (
                  <div className="absolute top-full left-0 z-50 mt-1 min-w-[140px] rounded-lg border border-white/15 bg-slate-900 p-1 shadow-xl">
                    {hiddenBlocks.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-slate-200 transition hover:bg-white/10"
                        onClick={() => {
                          handleShowBlock(key);
                          setShowHiddenOpen(false);
                        }}
                      >
                        <Plus className="h-3 w-3 text-orange-300" />
                        {CANONICAL_LABELS[key]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="outline"
              size="xs"
              onClick={handleToggleLogo}
            >
              <ImageOff className="h-3.5 w-3.5" />
              Logo {logoVisible ? "Off" : "On"}
            </Button>
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 uppercase">
              Corners{" "}
              <span className="min-w-[2ch] text-right tabular-nums">{overlayLayout?.hook?.borderRadius ?? 16}</span>
              <input
                type="range"
                min={0}
                max={32}
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
            <label className="flex items-center gap-1.5 text-[10px] text-slate-300 uppercase">
              Background{" "}
              <span className="min-w-[2ch] text-right tabular-nums">{overlayLayout?.hook?.bgOpacity ?? 28}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={overlayLayout?.hook?.bgOpacity ?? 28}
                onChange={(e) => {
                  if (!overlayLayout) return;
                  const o = parseInt(e.target.value);
                  dispatch({
                    type: "UPDATE_OVERLAY",
                    variantId: activeVariant.id,
                    layout: {
                      ...overlayLayout,
                      hook: { ...overlayLayout.hook, bgOpacity: o },
                      headline: { ...overlayLayout.headline, bgOpacity: o },
                      supportingText: { ...overlayLayout.supportingText, bgOpacity: o },
                      cta: { ...overlayLayout.cta, bgOpacity: o },
                      custom: (overlayLayout.custom ?? []).map((b) => ({ ...b, bgOpacity: o })),
                    },
                  });
                }}
                className="h-3 w-16 accent-orange-300"
                title={`Background opacity: ${overlayLayout?.hook?.bgOpacity ?? 28}%`}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">
              {saveStatusLabel(saveStatus)}
            </Badge>
            {onSaveNow ? (
              <Button variant="outline" size="xs" onClick={() => void onSaveNow()}>
                <Save className="h-3.5 w-3.5" />
                Save now
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
