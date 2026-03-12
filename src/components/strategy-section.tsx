"use client";

import {
  Copy,
  LoaderCircle,
  WandSparkles,
} from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type CreativeVariant,
  type GenerationResponse,
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

type Props = {
  result: GenerationResponse;
  activeVariant: CreativeVariant | null;
  isRefining: boolean;
  dispatch: (action: Record<string, unknown>) => void;
  captionValue: string;
  onRefineVariant: (instruction?: string) => void;
  onCaptionChange: (value: string) => void;
  onUseGeneratedCaption: () => void;
  onCopyCaption: () => void;
  copyState: "idle" | "done";
  lastRefinePromptPreview?: {
    systemPrompt: string;
    userPrompt: string;
  } | null;
};

export function StrategySection({
  result,
  activeVariant,
  isRefining,
  dispatch,
  captionValue,
  onRefineVariant,
  onCaptionChange,
  onUseGeneratedCaption,
  onCopyCaption,
  copyState,
  lastRefinePromptPreview,
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
                Post Caption
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="xs" onClick={onUseGeneratedCaption}>
                  Use generated
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="xs" onClick={onCopyCaption}>
                      <Copy className="h-3.5 w-3.5" />
                      {copyState === "done" ? "Copied" : "Copy"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy the current post caption</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <Textarea
              value={captionValue}
              onChange={(event) => onCaptionChange(event.target.value)}
              className="mt-3 min-h-[140px] text-sm"
              maxLength={2200}
              placeholder={`${activeVariant.caption}\n\n${activeVariant.hashtags.join(" ")}`}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Publishing uses this field. Leave it blank to fall back to the generated suggestion for the selected variant.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {captionValue.trim().length}/2200
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
                Generated Suggestion
              </p>
              <p className="mt-2 text-sm text-slate-200">{activeVariant.caption}</p>
              <p className="mt-3 text-xs text-orange-200">
                {activeVariant.hashtags.join(" ")}
              </p>
            </div>
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
            {lastRefinePromptPreview ? (
              <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
                  Last refine prompt used
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                      System prompt
                    </p>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-2 text-[11px] leading-relaxed text-slate-200">
                      {lastRefinePromptPreview.systemPrompt}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
                      User prompt
                    </p>
                    <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-2 text-[11px] leading-relaxed text-slate-200">
                      {lastRefinePromptPreview.userPrompt}
                    </pre>
                  </div>
                </div>
              </details>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
