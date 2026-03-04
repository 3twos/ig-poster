"use client";

import { MessageSquare, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { ChatEmpty } from "@/components/chat/chat-empty";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessages } from "@/components/chat/chat-messages";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChat } from "@/hooks/use-chat";
import { useChatConversations } from "@/hooks/use-chat-conversations";
import { DEFAULT_CHAT_TEMPERATURE } from "@/lib/chat-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Embeddable chat panel for the right-panel tab switcher.
 * Unlike ChatContainer, this omits the conversation sidebar and uses
 * a compact dropdown for conversation switching.
 */
export function ChatPanel() {
  const conversations = useChatConversations();
  const [model, setModel] = useState<string | undefined>(undefined);
  const [temperature, setTemperature] = useState(DEFAULT_CHAT_TEMPERATURE);
  const autoTitleRef = useRef(false);

  const chat = useChat({
    conversationId: conversations.activeId,
    model,
    temperature,
    onStreamComplete: (messages) => {
      if (conversations.activeId) {
        void conversations.saveMessages(conversations.activeId, messages);
      }

      if (
        conversations.activeId &&
        !autoTitleRef.current &&
        messages.length >= 2
      ) {
        autoTitleRef.current = true;
        const firstUserMsg = messages.find((m) => m.role === "user");
        if (firstUserMsg) {
          void autoTitle(conversations.activeId, firstUserMsg.content);
        }
      }
    },
  });

  const autoTitle = useCallback(
    async (convId: string, firstMessage: string) => {
      try {
        const res = await fetch("/api/chat/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstMessage }),
        });
        if (res.ok) {
          const { title } = await res.json();
          if (title) {
            void conversations.updateTitle(convId, title);
          }
        }
      } catch {
        // Non-critical
      }
    },
    [conversations],
  );

  const handleNewChat = useCallback(async () => {
    try {
      await conversations.create();
      chat.clearMessages();
      autoTitleRef.current = false;
    } catch {
      toast.error("Failed to create conversation");
    }
  }, [conversations, chat]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      const conv = await conversations.select(id);
      if (conv) {
        chat.loadMessages(conv.messages);
        setModel(conv.model);
        setTemperature(conv.temperature ?? DEFAULT_CHAT_TEMPERATURE);
        autoTitleRef.current = conv.messages.length >= 2;
      }
    },
    [conversations, chat],
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (!conversations.activeId) {
        try {
          await conversations.create();
          autoTitleRef.current = false;
        } catch {
          toast.error("Failed to create conversation");
          return;
        }
      }
      await chat.send(content);
    },
    [conversations, chat],
  );

  const hasMessages = chat.messages.length > 0 || chat.status === "streaming";
  const activeTitle =
    conversations.conversations.find((c) => c.id === conversations.activeId)
      ?.title ?? "New conversation";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-white transition hover:bg-white/10"
              aria-label="Switch conversation"
            >
              <MessageSquare className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate">{activeTitle}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
            {conversations.conversations.map((conv) => (
              <DropdownMenuItem
                key={conv.id}
                onClick={() => void handleSelectConversation(conv.id)}
                className={cn(
                  "text-xs",
                  conv.id === conversations.activeId && "bg-orange-400/10 text-orange-200",
                )}
              >
                <span className="truncate">{conv.title}</span>
              </DropdownMenuItem>
            ))}
            {conversations.conversations.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => void handleNewChat()} className="text-xs">
              <Plus className="mr-1.5 h-3 w-3" />
              New conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => void handleNewChat()}
          aria-label="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages or empty state */}
      {hasMessages ? (
        <ChatMessages
          messages={chat.messages}
          streamingContent={chat.streamingContent}
          isStreaming={chat.status === "streaming"}
          onEdit={(id, content) => void chat.editMessage(id, content)}
          onDelete={(id) => chat.deleteMessage(id)}
          onRegenerate={() => void chat.regenerate()}
        />
      ) : (
        <ChatEmpty onSuggestionClick={(text) => void handleSend(text)} />
      )}

      {/* Error banner */}
      {chat.error && (
        <div className="border-t border-red-500/20 bg-red-500/10 px-3 py-1.5">
          <p className="text-[11px] text-red-400">{chat.error}</p>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={(msg) => void handleSend(msg)}
        onStop={chat.stop}
        isStreaming={chat.status === "streaming"}
      />
    </div>
  );
}
