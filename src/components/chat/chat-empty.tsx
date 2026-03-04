"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Draft a carousel about brand trust",
  "Write a caption for a product launch",
  "Suggest hooks for a reel",
  "Help me plan this week's content",
] as const;

type ChatEmptyProps = {
  onSuggestionClick: (text: string) => void;
};

export function ChatEmpty({ onSuggestionClick }: ChatEmptyProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 animate-fade-in-up">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-400/15">
          <Sparkles className="h-7 w-7 text-orange-400" />
        </div>

        {/* Welcome text */}
        <div>
          <h3 className="text-base font-semibold text-white">
            Instagram AI Assistant
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Ask me anything about your Instagram content strategy, captions,
            hashtags, or creative direction.
          </p>
        </div>

        {/* Suggestion chips */}
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal rounded-xl border-white/15 px-3 py-2 text-left text-xs text-slate-300 hover:border-orange-400/40 hover:text-white"
              onClick={() => onSuggestionClick(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
