"use client";

import {
  Download,
  Sparkles,
  Square,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inferLogoNameFromUrl } from "@/lib/brand-kit";
import type { AspectRatio } from "@/lib/creative";
import type { BrandKitLogo, LlmAuthStatus, PostState } from "@/lib/types";
import { RATIO_OPTIONS } from "@/lib/types";
import { cn } from "@/lib/utils";

export type BrandKitOption = {
  id: string;
  name: string;
  logos: BrandKitLogo[];
};

const NO_LOGO_VALUE = "__no-logo__";

type PostBriefActionsProps = {
  llmAuthStatus: LlmAuthStatus;
  isGenerating: boolean;
  isUploadingAssets: boolean;
  hasAssets: boolean;
  hasResult: boolean;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onExportPoster: () => void;
  children?: React.ReactNode;
  extraActions?: React.ReactNode;
};

type PostBriefAspectRatioProps = {
  aspectRatio: AspectRatio;
  disabled?: boolean;
  showLabel?: boolean;
  onChange: (value: AspectRatio) => void;
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
  activeLogoUrl?: string | null;
  compact?: boolean;
  showHeader?: boolean;
  showActions?: boolean;
  showAspectRatio?: boolean;
  dispatch: (action: Record<string, unknown>) => void;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onExportPoster: () => void;
  onSelectBrandKit?: (kitId: string) => void;
  onSelectLogo?: (logoUrl: string | null) => void;
  extraActions?: React.ReactNode;
};

export function PostBriefActions({
  llmAuthStatus,
  isGenerating,
  isUploadingAssets,
  hasAssets,
  hasResult,
  onGenerate,
  onCancelGenerate,
  onExportPoster,
  children,
  extraActions,
}: PostBriefActionsProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {isGenerating ? (
          <Button
            variant="destructive"
            onClick={onCancelGenerate}
            className="border border-red-300/35 bg-red-400/10 text-red-100 hover:bg-red-400/20"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
          </Button>
        ) : (
          <Button onClick={onGenerate} disabled={!hasAssets || isUploadingAssets}>
            <Sparkles className="h-4 w-4" />
            Generate
          </Button>
        )}

        <Button variant="outline" onClick={onExportPoster} disabled={!hasResult}>
          <Download className="h-4 w-4" />
          Export PNG
        </Button>
        {extraActions}
        {children}
      </div>

      {!llmAuthStatus.connected ? (
        <p className="text-xs text-slate-400">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("ig:open-settings"))}
            className="underline"
          >
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
  );
}

export function PostBriefAspectRatio({
  aspectRatio,
  disabled,
  showLabel = true,
  onChange,
}: PostBriefAspectRatioProps) {
  return (
    <div className="space-y-1">
      {showLabel ? <Label className="text-xs text-slate-200">Aspect Ratio</Label> : null}
      <Select
        value={aspectRatio}
        disabled={disabled}
        onValueChange={(value) => onChange(value as AspectRatio)}
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
  );
}

export function PostBriefForm({
  post,
  llmAuthStatus,
  isGenerating,
  isUploadingAssets,
  hasAssets,
  hasResult,
  brandKits,
  activeBrandKitId,
  activeLogoUrl,
  compact = false,
  showHeader = true,
  showActions = true,
  showAspectRatio = true,
  dispatch,
  onGenerate,
  onCancelGenerate,
  onExportPoster,
  onSelectBrandKit,
  onSelectLogo,
  extraActions,
}: Props) {
  const hasBrandKitSelector = Boolean(
    brandKits && brandKits.length > 0 && onSelectBrandKit,
  );
  const activeBrandKit =
    brandKits?.find((kit) => kit.id === activeBrandKitId) ?? null;
  const activeLogos = activeBrandKit?.logos ?? [];
  const logoOptions =
    activeLogoUrl && !activeLogos.some((logo) => logo.url === activeLogoUrl)
      ? [
          ...activeLogos,
          {
            id: "current-logo",
            name: inferLogoNameFromUrl(activeLogoUrl),
            url: activeLogoUrl,
          },
        ]
      : activeLogos;
  const showLogoSelector = Boolean(
    onSelectLogo && (hasBrandKitSelector || activeLogoUrl),
  );

  const aspectRatioField = (
    <PostBriefAspectRatio
      aspectRatio={post.aspectRatio}
      disabled={isGenerating}
      onChange={(value) =>
        dispatch({ type: "UPDATE_BRIEF", brief: { aspectRatio: value } })
      }
    />
  );

  const brandKitField = hasBrandKitSelector ? (
    <div className="space-y-1">
      <Label className="text-xs text-slate-200">Brand Kit</Label>
      <Select
        value={activeBrandKitId ?? ""}
        onValueChange={onSelectBrandKit}
        disabled={isGenerating}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select brand kit" />
        </SelectTrigger>
        <SelectContent>
          {brandKits?.map((kit) => (
            <SelectItem key={kit.id} value={kit.id}>
              {kit.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  const logoField = showLogoSelector ? (
    <div className="space-y-1">
      <Label className="text-xs text-slate-200">Logo</Label>
      <Select
        value={activeLogoUrl ?? NO_LOGO_VALUE}
        onValueChange={(value) =>
          onSelectLogo?.(value === NO_LOGO_VALUE ? null : value)
        }
        disabled={isGenerating || (!activeBrandKitId && !activeLogoUrl)}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              activeBrandKitId
                ? "Select logo"
                : activeLogoUrl
                  ? "Legacy logo"
                  : "Select a brand kit first"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_LOGO_VALUE}>No logo</SelectItem>
          {logoOptions.map((logo) => (
            <SelectItem key={logo.id} value={logo.url}>
              {logo.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {showHeader ? (
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <WandSparkles className="h-4 w-4 text-orange-300" />
          Post Brief
        </div>
      ) : null}

      {brandKitField || logoField ? (
        <div className="grid gap-3 md:grid-cols-2">
          {brandKitField}
          {logoField}
        </div>
      ) : null}

      <div className={cn("grid gap-3", compact ? "" : "md:grid-cols-2")}>
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Theme</Label>
          <Input
            value={post.theme}
            disabled={isGenerating}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { theme: event.target.value } })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Subject</Label>
          <Input
            value={post.subject}
            disabled={isGenerating}
            onChange={(event) =>
              dispatch({
                type: "UPDATE_BRIEF",
                brief: { subject: event.target.value },
              })
            }
          />
        </div>

        <div className={cn("space-y-1", compact ? "" : "md:col-span-2")}>
          <Label className="text-xs text-slate-200">Core Thought</Label>
          <Textarea
            value={post.thought}
            disabled={isGenerating}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { thought: event.target.value } })
            }
            rows={3}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Objective</Label>
          <Input
            value={post.objective}
            disabled={isGenerating}
            onChange={(event) =>
              dispatch({
                type: "UPDATE_BRIEF",
                brief: { objective: event.target.value },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Audience</Label>
          <Input
            value={post.audience}
            disabled={isGenerating}
            onChange={(event) =>
              dispatch({
                type: "UPDATE_BRIEF",
                brief: { audience: event.target.value },
              })
            }
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-slate-200">Mood</Label>
          <Input
            value={post.mood}
            disabled={isGenerating}
            onChange={(event) =>
              dispatch({ type: "UPDATE_BRIEF", brief: { mood: event.target.value } })
            }
          />
        </div>
        {showAspectRatio ? aspectRatioField : null}
      </div>

      {showActions ? (
        <PostBriefActions
          llmAuthStatus={llmAuthStatus}
          isGenerating={isGenerating}
          isUploadingAssets={isUploadingAssets}
          hasAssets={hasAssets}
          hasResult={hasResult}
          onGenerate={onGenerate}
          onCancelGenerate={onCancelGenerate}
          onExportPoster={onExportPoster}
          extraActions={extraActions}
        />
      ) : null}
    </div>
  );
}
