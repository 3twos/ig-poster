"use client";

import {
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SaveStatus } from "@/hooks/use-auto-save";
import type {
  CanonicalOverlayKey,
  CreativeVariant,
  GenerationResponse,
  OverlayLayout,
} from "@/lib/creative";
import { cn } from "@/lib/utils";

const REFINE_PRESETS = [
  {
    label: "Shorter caption",
    instruction:
      "Make the caption significantly shorter and punchier while keeping the core message",
  },
  {
    label: "Stronger hook",
    instruction:
      "Rewrite the hook to be more attention-grabbing with a bold claim, number, or provocative question",
  },
  {
    label: "Premium tone",
    instruction:
      "Elevate the language to feel more premium, sophisticated, and aspirational without being pretentious",
  },
  {
    label: "More saveable",
    instruction:
      "Restructure the caption as a value-packed list or framework that followers will want to save for reference",
  },
  {
    label: "More shareable",
    instruction:
      "Rewrite to be more relatable and tag-worthy so followers will share it with friends",
  },
];

const CANONICAL_EDITOR_FIELDS = [
  { key: "hook", label: "Hook", input: "single-line" as const },
  { key: "headline", label: "Headline", input: "multi-line" as const },
  { key: "supportingText", label: "Body", input: "multi-line" as const },
  { key: "cta", label: "CTA", input: "single-line" as const },
 ] as const satisfies ReadonlyArray<{
  key: CanonicalOverlayKey;
  label: string;
  input: "single-line" | "multi-line";
}>;

type Props = {
  result: GenerationResponse;
  activeVariant: CreativeVariant | null;
  editorMode: boolean;
  isRefining: boolean;
  dispatch: (action: Record<string, unknown>) => void;
  onRefineVariant: (instruction?: string) => void;
  onCopyCaption: () => void;
  copyState: "idle" | "done";
  overlayLayout?: OverlayLayout;
  onOverlayLayoutChange: (layout: OverlayLayout) => void;
  saveStatus: SaveStatus;
  onSaveNow: () => Promise<void>;
};

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
const MAX_OVERLAY_TEXT_LENGTH = 320;
const MAX_CUSTOM_LABEL_LENGTH = 32;

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

function normalizeCustomLabel(raw: string, fallbackLabel: string): string {
  const trimmed = raw.trim();
  return trimmed.slice(0, MAX_CUSTOM_LABEL_LENGTH) || fallbackLabel;
}

function EditorInspector({
  activeVariant,
  overlayLayout,
  onOverlayLayoutChange,
  saveStatus,
  onSaveNow,
}: {
  activeVariant: CreativeVariant;
  overlayLayout: OverlayLayout;
  onOverlayLayoutChange: (layout: OverlayLayout) => void;
  saveStatus: SaveStatus;
  onSaveNow: () => Promise<void>;
}) {
  const baseTexts = useMemo(
    () => ({
      hook: activeVariant.hook,
      headline: activeVariant.headline,
      supportingText: activeVariant.supportingText,
      cta: activeVariant.cta,
    }),
    [activeVariant],
  );

  const updateCanonicalField = (
    key: CanonicalOverlayKey,
    patch: Partial<OverlayLayout[CanonicalOverlayKey]>,
  ) => {
    onOverlayLayoutChange({
      ...overlayLayout,
      [key]: {
        ...overlayLayout[key],
        ...patch,
      },
    });
  };

  const addCustomField = () => {
    const currentCount = overlayLayout.custom?.length ?? 0;
    if (currentCount >= MAX_CUSTOM_TEXT_BOXES) {
      return;
    }

    onOverlayLayoutChange({
      ...overlayLayout,
      custom: [...(overlayLayout.custom ?? []), createCustomTextBox(currentCount)],
    });
  };

  const updateCustomField = (
    id: string,
    patch: Partial<OverlayLayout["custom"][number]>,
  ) => {
    onOverlayLayoutChange({
      ...overlayLayout,
      custom: (overlayLayout.custom ?? []).map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    });
  };

  const removeCustomField = (id: string) => {
    onOverlayLayoutChange({
      ...overlayLayout,
      custom: (overlayLayout.custom ?? []).filter((block) => block.id !== id),
    });
  };

  return (
    <div className="rounded-2xl border border-white/15 bg-black/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
            Canvas Editor
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Drag boxes on the canvas, edit copy here, and use hide/remove to simplify the layout.
            Changes auto-save after a short delay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase">
            {saveStatusLabel(saveStatus)}
          </Badge>
          <Button variant="outline" size="xs" onClick={() => void onSaveNow()}>
            <Save className="h-3.5 w-3.5" />
            Save now
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {CANONICAL_EDITOR_FIELDS.map((field) => {
          const block = overlayLayout[field.key];
          const isVisible = block.visible;
          const value = block.text;

          return (
            <div
              key={field.key}
              className="rounded-xl border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-[0.16em] text-slate-200 uppercase">
                  {field.label}
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    updateCanonicalField(field.key, { visible: !isVisible })
                  }
                >
                  {isVisible ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Add back
                    </>
                  )}
                </Button>
              </div>

              {field.input === "multi-line" ? (
                <Textarea
                  value={value}
                  disabled={!isVisible}
                  maxLength={MAX_OVERLAY_TEXT_LENGTH}
                  onChange={(event) =>
                    updateCanonicalField(field.key, { text: event.target.value })
                  }
                  rows={field.key === "headline" ? 2 : 4}
                  placeholder={baseTexts[field.key]}
                  className="mt-3"
                />
              ) : (
                <Input
                  value={value}
                  disabled={!isVisible}
                  maxLength={MAX_OVERLAY_TEXT_LENGTH}
                  onChange={(event) =>
                    updateCanonicalField(field.key, { text: event.target.value })
                  }
                  placeholder={baseTexts[field.key]}
                  className="mt-3"
                />
              )}

              <div className="mt-3 flex items-center gap-3">
                <span className="text-[11px] text-slate-400">Scale</span>
                <input
                  type="range"
                  min="0.6"
                  max="2.4"
                  step="0.05"
                  disabled={!isVisible}
                  value={block.fontScale}
                  onChange={(event) =>
                    updateCanonicalField(field.key, {
                      fontScale: Number(event.target.value),
                    })
                  }
                  className="flex-1 accent-orange-400"
                />
                <span className="w-10 text-right text-[11px] text-slate-300">
                  {block.fontScale.toFixed(2)}x
                </span>
              </div>

              <p className="mt-2 text-[11px] text-slate-500">
                Leave this field blank to keep the generated copy.
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-200 uppercase">
            Custom Text Boxes
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={addCustomField}
            disabled={(overlayLayout.custom?.length ?? 0) >= MAX_CUSTOM_TEXT_BOXES}
          >
            <Plus className="h-3.5 w-3.5" />
            Add box
          </Button>
        </div>

        {overlayLayout.custom?.length ? (
          <div className="mt-3 grid gap-3">
            {overlayLayout.custom.map((block, index) => (
              <div
                key={block.id}
                className="rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={block.label}
                    maxLength={MAX_CUSTOM_LABEL_LENGTH}
                    onChange={(event) =>
                      updateCustomField(block.id, {
                        label: normalizeCustomLabel(
                          event.target.value,
                          `Text Box ${index + 1}`,
                        ),
                      })
                    }
                    onBlur={() =>
                      updateCustomField(block.id, {
                        label: normalizeCustomLabel(
                          block.label,
                          `Text Box ${index + 1}`,
                        ),
                      })
                    }
                    placeholder="Text Box"
                    className="h-8"
                  />
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => removeCustomField(block.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>

                <Textarea
                  value={block.text}
                  maxLength={MAX_OVERLAY_TEXT_LENGTH}
                  onChange={(event) =>
                    updateCustomField(block.id, { text: event.target.value })
                  }
                  rows={3}
                  placeholder="Custom text"
                  className="mt-3"
                />

                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">Scale</span>
                  <input
                    type="range"
                    min="0.6"
                    max="2.4"
                    step="0.05"
                    value={block.fontScale}
                    onChange={(event) =>
                      updateCustomField(block.id, {
                        fontScale: Number(event.target.value),
                      })
                    }
                    className="flex-1 accent-orange-400"
                  />
                  <span className="w-10 text-right text-[11px] text-slate-300">
                    {block.fontScale.toFixed(2)}x
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Add a custom text box when the generated hook/headline/body/CTA set is not enough.
          </p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-200 uppercase">
            Logo
          </p>
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              onOverlayLayoutChange({
                ...overlayLayout,
                logo: {
                  ...(overlayLayout.logo ?? { x: 3, y: 3, width: 20, height: 6, visible: true }),
                  visible: !(overlayLayout.logo?.visible ?? true),
                },
              })
            }
          >
            {(overlayLayout.logo?.visible ?? true) ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Hide
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Show
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Drag the logo on the canvas to reposition it.
        </p>
      </div>
    </div>
  );
}

export function StrategySection({
  result,
  activeVariant,
  editorMode,
  isRefining,
  dispatch,
  onRefineVariant,
  onCopyCaption,
  copyState,
  overlayLayout,
  onOverlayLayoutChange,
  saveStatus,
  onSaveNow,
}: Props) {
  const [refineInstruction, setRefineInstruction] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.2em] text-orange-200 uppercase">
          Strategy
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-200">{result.strategy}</p>

      {editorMode && activeVariant && overlayLayout ? (
        <EditorInspector
          activeVariant={activeVariant}
          overlayLayout={overlayLayout}
          onOverlayLayoutChange={onOverlayLayoutChange}
          saveStatus={saveStatus}
          onSaveNow={onSaveNow}
        />
      ) : null}

      <div className="grid gap-2">
        {result.variants.map((variant) => {
          const isActive = variant.id === activeVariant?.id;
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => dispatch({ type: "SET_ACTIVE_VARIANT", variantId: variant.id })}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition-all duration-200",
                isActive
                  ? "border-orange-400 bg-orange-500/10 shadow-[0_12px_40px_-24px_rgba(251,146,60,0.95)]"
                  : "border-white/15 bg-slate-900/30 hover:border-white/30",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                    {variant.name}
                  </p>
                  {variant.score != null ? (
                    <Badge
                      variant="outline"
                      className="border-orange-400/30 bg-orange-400/20 text-[10px] text-orange-300"
                    >
                      {variant.score.toFixed(1)}
                    </Badge>
                  ) : null}
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {variant.postType}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-medium text-white">{variant.headline}</p>
              <p className="mt-1 text-xs text-slate-300">
                {variant.layout} · {variant.assetSequence.length} asset(s)
              </p>
            </button>
          );
        })}
      </div>

      {activeVariant ? (
        <>
          {activeVariant.scoreRationale ? (
            <p className="text-xs italic leading-relaxed text-slate-400">
              {activeVariant.scoreRationale}
            </p>
          ) : null}

          {activeVariant.postType === "carousel" && activeVariant.carouselSlides ? (
            <div className="rounded-2xl border border-white/15 bg-black/25 p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                Carousel Slide Plan
              </p>
              <div className="mt-3 space-y-2">
                {activeVariant.carouselSlides.map((slide) => (
                  <div
                    key={`${activeVariant.id}-slide-${slide.index}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-2.5"
                  >
                    <p className="text-[11px] font-semibold text-orange-200">
                      Slide {slide.index}: {slide.goal}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-100">
                      {slide.headline}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">{slide.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Asset hint: {slide.assetHint}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeVariant.postType === "reel" && activeVariant.reelPlan ? (
            <div className="rounded-2xl border border-white/15 bg-black/25 p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                Reel Edit Blueprint
              </p>
              <p className="mt-2 text-sm text-slate-200">
                Hook: {activeVariant.reelPlan.hook}
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Target duration: {Math.round(activeVariant.reelPlan.targetDurationSec)}s
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Cover frame: {activeVariant.reelPlan.coverFrameDirection}
              </p>
              <p className="mt-1 text-xs text-slate-300">
                Audio: {activeVariant.reelPlan.audioDirection}
              </p>
              <div className="mt-3 space-y-1.5">
                {activeVariant.reelPlan.editingActions.map((action, index) => (
                  <p
                    key={`${activeVariant.id}-edit-${index}`}
                    className="text-xs text-slate-200"
                  >
                    • {action}
                  </p>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {activeVariant.reelPlan.beats.map((beat, index) => (
                  <div
                    key={`${activeVariant.id}-beat-${index}`}
                    className="rounded-xl border border-white/10 bg-white/5 p-2.5"
                  >
                    <p className="text-[11px] font-semibold text-orange-200">
                      {beat.atSec.toFixed(1)}s
                    </p>
                    <p className="mt-1 text-xs text-slate-100">{beat.visual}</p>
                    <p className="mt-1 text-xs text-slate-300">
                      On-screen: {beat.onScreenText}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Edit: {beat.editAction}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold text-emerald-200">
                End card CTA: {activeVariant.reelPlan.endCardCta}
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/15 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                Caption Bundle
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="xs" onClick={onCopyCaption}>
                    <Copy className="h-3.5 w-3.5" />
                    {copyState === "done" ? "Copied" : "Copy"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy caption and hashtags</TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-2 text-sm text-slate-200">{activeVariant.caption}</p>
            <p className="mt-3 text-xs text-orange-200">
              {activeVariant.hashtags.join(" ")}
            </p>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/25 p-4">
            <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
              Refine This Variant
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REFINE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="xs"
                  onClick={() => onRefineVariant(preset.instruction)}
                  disabled={isRefining}
                  className="hover:border-orange-400/50 hover:text-orange-300"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={refineInstruction}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRefineInstruction(event.target.value)
                }
                placeholder="Or type a custom instruction..."
                className="flex-1"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onRefineVariant(refineInstruction.trim());
                    setRefineInstruction("");
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  onRefineVariant(refineInstruction.trim());
                  setRefineInstruction("");
                }}
                disabled={isRefining || !refineInstruction.trim()}
              >
                {isRefining ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <WandSparkles className="h-3.5 w-3.5" />
                )}
                {isRefining ? "Refining..." : "Refine"}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
