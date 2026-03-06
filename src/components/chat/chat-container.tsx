"use client";

import { Menu } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { ChatEmpty } from "@/components/chat/chat-empty";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessages } from "@/components/chat/chat-messages";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/use-chat";
import { useChatConversations } from "@/hooks/use-chat-conversations";
import { DEFAULT_CHAT_TEMPERATURE } from "@/lib/chat-types";
import { toast } from "sonner";

export function ChatContainer() {
  const conversations = useChatConversations();
  const [model, setModel] = useState<string | undefined>(undefined);
  const [temperature, setTemperature] = useState(DEFAULT_CHAT_TEMPERATURE);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const autoTitleRef = useRef(false);

  const chat = useChat({
    conversationId: conversations.activeId,
    model,
    temperature,
    onStreamComplete: (messages) => {
      if (conversations.activeId) {
        void conversations.saveMessages(conversations.activeId, messages);
      }

      // Auto-title after first exchange
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
      const id = await conversations.create();
      chat.clearMessages();
      autoTitleRef.current = false;
      return id;
    } catch {
      toast.error("Failed to create conversation");
      return "";
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

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await conversations.remove(id);
      if (conversations.activeId === id) {
        chat.clearMessages();
        autoTitleRef.current = false;
      }
    },
    [conversations, chat],
  );

  const handleSend = useCallback(
    async (content: string) => {
      // Create conversation if none active
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

  const handleSuggestionClick = useCallback(
    (text: string) => {
      void handleSend(text);
    },
    [handleSend],
  );

  const hasMessages = chat.messages.length > 0 || chat.status === "streaming";
  const activeTitle =
    conversations.conversations.find((c) => c.id === conversations.activeId)
      ?.title ?? "New conversation";

  return (
    <div className="flex h-full w-full overflow-hidden rounded-xl border border-white/15 bg-slate-900/55 backdrop-blur-xl">
      {/* Sidebar */}
      <ChatSidebar
        conversations={conversations.conversations}
        activeId={conversations.activeId}
        isLoading={conversations.isLoading}
        onSelect={(id) => void handleSelectConversation(id)}
        onNew={() => void handleNewChat()}
        onDelete={(id) => void handleDeleteConversation(id)}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile menu button + header */}
        <div className="flex items-center gap-2 lg:hidden border-b border-white/10 px-2 py-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open conversations"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <span className="truncate text-sm font-medium text-white">
            {activeTitle}
          </span>
        </div>

        {/* Desktop header */}
        <div className="hidden lg:block">
          <ChatHeader
            title={activeTitle}
            model={model}
            temperature={temperature}
            onModelChange={setModel}
            onTemperatureChange={setTemperature}
            isStreaming={chat.status === "streaming"}
          />
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
          <ChatEmpty onSuggestionClick={handleSuggestionClick} />
        )}

        {/* Error banner */}
        {chat.error && (
          <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-2">
            <p className="text-xs text-red-400">{chat.error}</p>
          </div>
        )}

        {/* Input */}
        <ChatInput
          onSend={(msg) => void handleSend(msg)}
          onStop={chat.stop}
          isStreaming={chat.status === "streaming"}
        />
      </div>
    </div>
  );
}
