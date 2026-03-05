"use client";

import {
  Check,
  Copy,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";

import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatMessage as ChatMessageType } from "@/lib/chat-types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ChatMessageProps = {
  message: ChatMessageType;
  isStreaming?: boolean;
  streamingContent?: string;
  isLastAssistant?: boolean;
  onCopy?: () => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming,
  streamingContent,
  isLastAssistant,
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [message.content, onCopy]);

  const startEdit = useCallback(() => {
    setEditValue(message.content);
    setIsEditing(true);
    setTimeout(() => editRef.current?.focus(), 0);
  }, [message.content]);

  const submitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit?.(trimmed);
    }
    setIsEditing(false);
  }, [editValue, message.content, onEdit]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(message.content);
  }, [message.content]);

  // The display content — use streaming if this is the active streaming message
  const displayContent =
    isStreaming && streamingContent !== undefined
      ? streamingContent
      : message.content;

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
      role="article"
      aria-label={`${isUser ? "You" : "AI"}: ${message.content.slice(0, 60)}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-orange-400/20 text-orange-400"
            : "bg-white/10 text-slate-300",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser && "items-end")}>
        {isEditing ? (
          <div className="flex w-full flex-col gap-2">
            <textarea
              ref={editRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitEdit();
                }
                if (e.key === "Escape") cancelEdit();
              }}
              className="min-h-[60px] w-full resize-none rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white focus:border-orange-400/50 focus:outline-none"
              aria-label="Edit message"
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={submitEdit} className="h-7 text-xs">
                Save & Submit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl text-sm",
              isUser
                ? "bg-orange-400/15 px-4 py-2.5 text-white"
                : "text-slate-200",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{displayContent}</p>
            ) : (
              <ChatMarkdown content={displayContent} isStreaming={isStreaming} />
            )}
          </div>
        )}

        {/* Meta row: timestamp + actions */}
        {!isEditing && !isStreaming && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default text-[10px] text-slate-500">
                  {relativeTime(message.createdAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {new Date(message.createdAt).toLocaleString()}
              </TooltipContent>
            </Tooltip>

            <ActionButton
              icon={copied ? Check : Copy}
              label={copied ? "Copied" : "Copy"}
              onClick={() => void handleCopy()}
            />

            {isUser && onEdit && (
              <ActionButton icon={Pencil} label="Edit" onClick={startEdit} />
            )}

            {onDelete && (
              <ActionButton icon={Trash2} label="Delete" onClick={onDelete} />
            )}

            {!isUser && isLastAssistant && onRegenerate && (
              <ActionButton
                icon={RefreshCw}
                label="Regenerate"
                onClick={onRegenerate}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Small action button
// ---------------------------------------------------------------------------

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-white"
          aria-label={label}
        >
          <Icon className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
