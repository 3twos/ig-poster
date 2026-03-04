"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
} from "@/lib/chat-types";

export function useChatConversations() {
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeConversationRef = useRef<ChatConversation | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    const conv: ChatConversation = await res.json();
    activeConversationRef.current = conv;
    setActiveId(conv.id);
    await refresh();
    return conv;
  }, [refresh]);

  const select = useCallback(async (id: string) => {
    setActiveId(id);
    try {
      const res = await fetch(`/api/chat/conversations/${id}`);
      if (res.ok) {
        const conv: ChatConversation = await res.json();
        activeConversationRef.current = conv;
        return conv;
      }
    } catch {
      // Non-critical
    }
    return null;
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
      if (activeId === id) {
        setActiveId(null);
        activeConversationRef.current = null;
      }
      await refresh();
    } catch {
      // Non-critical
    }
  }, [activeId, refresh]);

  const updateTitle = useCallback(async (id: string, title: string) => {
    try {
      await fetch(`/api/chat/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      await refresh();
    } catch {
      // Non-critical
    }
  }, [refresh]);

  const saveMessages = useCallback(async (id: string, messages: ChatMessage[]) => {
    try {
      await fetch(`/api/chat/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    } catch {
      // Non-critical
    }
  }, []);

  const clearActive = useCallback(() => {
    setActiveId(null);
    activeConversationRef.current = null;
  }, []);

  return {
    conversations,
    isLoading,
    activeId,
    activeConversation: activeConversationRef.current,
    refresh,
    create,
    select,
    remove,
    updateTitle,
    saveMessages,
    clearActive,
  };
}
