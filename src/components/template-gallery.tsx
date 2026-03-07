"use client";

import { BookTemplate } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PROMPT_TEMPLATES, type PromptTemplate } from "@/lib/prompt-templates";
import type { PostState } from "@/lib/types";

type Props = {
  onApply: (brief: Partial<PostState>) => void;
  disabled?: boolean;
};

export function TemplateGallery({ onApply, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PromptTemplate | null>(null);

  const handleApply = (template: PromptTemplate) => {
    onApply(template.brief);
    setOpen(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="outline" size="xs" disabled={disabled}>
              <BookTemplate className="h-3.5 w-3.5" />
              Templates
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Start from a prompt template</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prompt Templates</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {PROMPT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() =>
                selected?.id === template.id
                  ? handleApply(template)
                  : setSelected(template)
              }
              className={`group relative rounded-xl border p-3 text-left transition hover:border-orange-400/40 hover:bg-orange-400/5 ${
                selected?.id === template.id
                  ? "border-orange-400/50 bg-orange-400/10"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl leading-none">{template.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    {template.name}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                    {template.description}
                  </p>
                </div>
              </div>
              {selected?.id === template.id && (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <div className="space-y-1 text-[11px] text-slate-300">
                    <p>
                      <span className="text-slate-500">Theme:</span>{" "}
                      {template.brief.theme}
                    </p>
                    <p>
                      <span className="text-slate-500">Objective:</span>{" "}
                      {template.brief.objective}
                    </p>
                    <p>
                      <span className="text-slate-500">Mood:</span>{" "}
                      {template.brief.mood}
                    </p>
                  </div>
                  <Button
                    size="xs"
                    className="mt-2 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApply(template);
                    }}
                  >
                    Apply Template
                  </Button>
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
