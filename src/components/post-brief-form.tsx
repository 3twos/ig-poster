"use client";

import {
  Download,
  ImagePlus,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { ChangeEvent } from "react";

import { TemplateGallery } from "@/components/template-gallery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AspectRatio } from "@/lib/creative";
import type { PostState, LlmAuthStatus } from "@/lib/types";
import { RATIO_OPTIONS } from "@/lib/types";
import { toast } from "sonner";

export type BrandKitOption = {
  id: string;
  name: string;
};

type Props = {
  post: PostState;
  llmAuthStatus: LlmAuthStatus;
  isGenerating: boolean;
  isUploadingAssets: boolean;
  hasAssets: boolean;
  hasResult: boolean;
  brandKits?: BrandKitOption[];
  activeBrandKitId?: string | null;
  dispatch: (action: Record<string, unknown>) => void;
  onAssetUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
  onExportPoster: () => void;
  onSelectBrandKit?: (kitId: string) => void;
};

export function PostBriefForm({
  post,
  llmAuthStatus,
  isGenerating,
  isUploadingAssets,
  hasAssets,
  hasResult,
  brandKits,
  activeBrandKitId,
  dispatch,
  onAssetUpload,
  onGenerate,
  onExportPoster,
  onSelectBrandKit,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <WandSparkles className="h-4 w-4 text-orange-300" />
          Post Brief
        </div>
        <TemplateGallery
          onApply={(brief) => {
            dispatch({ type: "UPDATE_BRIEF", brief });
            toast.success("Template applied to brief.");
          }}
        />
      </div>

      {/* Brand Kit selector */}
      {brandKits && brandKits.length > 0 && onSelectBrandKit && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Brand Kit</Label>
          <Select
            value={activeBrandKitId ?? ""}
            onValueChange={onSelectBrandKit}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select brand kit" />
            </SelectTrigger>
            <SelectContent>
              {brandKits.map((kit) => (
                <SelectItem key={kit.id} value={kit.id}>
                  {kit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Asset Upload */}
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/30 bg-white/5 px-3 py-3 text-xs font-medium text-slate-200 transition hover:border-orange-300">
        <span className="inline-flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-orange-300" />
          Upload Post Assets
        </span>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={onAssetUpload}
        />
      </label>

      {/* Theme + Subject */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Theme</Label>
          <Input
            value={post.theme}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { theme: event.target.value } })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Subject</Label>
          <Input
            value={post.subject}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { subject: event.target.value } })
            }
          />
        </div>

        {/* Core Thought */}
        <div className="space-y-1 md:col-span-2">
          <Label className="text-xs text-slate-200">Core Thought</Label>
          <Textarea
            value={post.thought}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { thought: event.target.value } })
            }
            rows={3}
          />
        </div>

        {/* Objective + Audience */}
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Objective</Label>
          <Input
            value={post.objective}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { objective: event.target.value } })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Audience</Label>
          <Input
            value={post.audience}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { audience: event.target.value } })
            }
          />
        </div>

        {/* Mood + Aspect Ratio */}
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Mood</Label>
          <Input
            value={post.mood}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { mood: event.target.value } })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Aspect Ratio</Label>
          <Select
            value={post.aspectRatio}
            onValueChange={(value) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { aspectRatio: value as AspectRatio } })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATIO_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Generate button */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onGenerate}
          disabled={isGenerating || !hasAssets || isUploadingAssets}
        >
          {isGenerating ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isGenerating ? "Generating..." : "Generate"}
        </Button>

        <Button
          variant="outline"
          onClick={onExportPoster}
          disabled={!hasResult}
        >
          <Download className="h-4 w-4" />
          Export PNG
        </Button>

        {!llmAuthStatus.connected ? (
          <p className="text-xs text-slate-400">
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ig:open-settings"))} className="underline">
              Connect an LLM provider
            </button>{" "}
            for AI-powered generation.
          </p>
        ) : null}

        {isUploadingAssets ? (
          <p className="text-xs text-blue-200">
            Uploading assets to persistent storage...
          </p>
        ) : null}
      </div>
    </div>
  );
}
