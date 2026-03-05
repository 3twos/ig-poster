"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatMessage } from "@/components/chat/chat-message";
import { ChatThinking } from "@/components/chat/chat-thinking";
import { Button } from "@/components/ui/button";
import type { ChatMessage as ChatMessageType } from "@/lib/chat-types";
import { cn } from "@/lib/utils";

type ChatMessagesProps = {
  messages: ChatMessageType[];
  streamingContent: string;
  isStreaming: boolean;
  onCopy?: (id: string) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onRegenerate?: () => void;
};

export function ChatMessages({
  messages,
  streamingContent,
  isStreaming,
  onCopy,
  onEdit,
  onDelete,
  onRegenerate,
}: ChatMessagesProps) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const wasAtBottomRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Track scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAtBottom(atBottom);
      wasAtBottomRef.current = atBottom;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll when new content arrives (only if user was at bottom)
  useEffect(() => {
    if (wasAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [messages.length, streamingContent]);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    wasAtBottomRef.current = true;
    setIsAtBottom(true);
  }, []);

  // Find last assistant message for the regenerate action
  const lastAssistantIdx = messages.findLastIndex((m) => m.role === "assistant");

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10"
      >
        <div
          className="flex flex-col py-4"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.map((msg, i) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isLastAssistant={i === lastAssistantIdx}
              onCopy={() => onCopy?.(msg.id)}
              onEdit={
                msg.role === "user"
                  ? (content) => onEdit?.(msg.id, content)
                  : undefined
              }
              onDelete={() => onDelete?.(msg.id)}
              onRegenerate={
                i === lastAssistantIdx ? onRegenerate : undefined
              }
            />
          ))}

          {/* Streaming message in progress */}
          {isStreaming && streamingContent && (
            <ChatMessage
              message={{
                id: "__streaming__",
                role: "assistant",
                content: "",
                createdAt: new Date().toISOString(),
              }}
              isStreaming
              streamingContent={streamingContent}
            />
          )}

          {/* Thinking indicator before first token */}
          {isStreaming && !streamingContent && <ChatThinking />}

          {/* Scroll anchor */}
          <div ref={endRef} className="h-1" aria-hidden />
        </div>
      </div>

      {/* Scroll to bottom button */}
      <div
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 transition-all",
          isAtBottom
            ? "pointer-events-none translate-y-2 opacity-0"
            : "translate-y-0 opacity-100",
        )}
      >
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 rounded-full border-white/20 bg-slate-900/90 shadow-lg backdrop-blur-sm"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
