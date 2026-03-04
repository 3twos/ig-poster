"use client";

import { ArrowUp, Square } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disabledReason,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Focus after sending
  const focusInput = useCallback(() => {
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue("");
    focusInput();
  }, [value, disabled, isStreaming, onSend, focusInput]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send, Shift+Enter for newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      // Escape to stop generation
      if (e.key === "Escape" && isStreaming) {
        onStop();
      }
    },
    [handleSend, isStreaming, onStop],
  );

  return (
    <div className="border-t border-white/10 bg-slate-900/80 px-4 py-3 backdrop-blur-xl">
      {disabled && disabledReason && (
        <p className="mb-2 text-center text-xs text-slate-500">
          {disabledReason}
        </p>
      )}
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-2",
          "focus-within:border-orange-400/50 focus-within:ring-1 focus-within:ring-orange-400/20",
          disabled && "opacity-50",
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Connect an AI provider first" : "Ask anything about your content..."}
          disabled={disabled}
          rows={1}
          className={cn(
            "max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent text-sm text-white",
            "placeholder:text-slate-500 focus:outline-none",
            "scrollbar-thin scrollbar-thumb-white/10",
          )}
          aria-label="Chat message input"
        />

        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={onStop}
            aria-label="Stop generating"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="mt-1.5 text-center text-[10px] text-slate-600">
        Press Enter to send, Shift+Enter for new line
        {isStreaming && " · Esc to stop"}
      </p>
    </div>
  );
}
