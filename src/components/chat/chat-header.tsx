"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MODELS = [
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
] as const;

type ChatHeaderProps = {
  title?: string;
  model?: string;
  temperature?: number;
  onModelChange?: (model: string) => void;
  onTemperatureChange?: (temp: number) => void;
  isStreaming?: boolean;
};

export function ChatHeader({
  title,
  model,
  temperature,
  onModelChange,
  onTemperatureChange,
  isStreaming,
}: ChatHeaderProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="border-b border-white/10 bg-white/[0.02] px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Title */}
        <h2 className="truncate text-sm font-medium text-white">
          {title || "New conversation"}
        </h2>

        {/* Model badge + settings toggle */}
        <div className="flex items-center gap-2">
          {model && (
            <span className="text-[11px] text-slate-400">
              {MODELS.find((m) => m.value === model)?.label ?? model}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setShowSettings((s) => !s)}
                disabled={isStreaming}
                aria-label="Chat settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Settings
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Expandable settings panel */}
      {showSettings && (
        <div
          className={cn(
            "mt-2 flex flex-wrap items-end gap-4 border-t border-white/5 pt-2",
            "animate-fade-in-up",
          )}
        >
          {/* Model selector */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-slate-400">Model</Label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Temperature */}
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-slate-400">
              Temperature ({temperature?.toFixed(1) ?? "0.7"})
            </Label>
            <Input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature ?? 0.7}
              onChange={(e) =>
                onTemperatureChange?.(parseFloat(e.target.value))
              }
              className="h-8 w-[120px]"
              aria-label="Temperature"
            />
          </div>
        </div>
      )}
    </div>
  );
}
