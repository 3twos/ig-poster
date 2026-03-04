"use client";

import { useCallback, useReducer, useRef } from "react";

import type { ChatMessage, ChatStreamingStatus } from "@/lib/chat-types";

// ---------------------------------------------------------------------------
// State & Actions
// ---------------------------------------------------------------------------

type ChatState = {
  messages: ChatMessage[];
  streamingContent: string;
  status: ChatStreamingStatus;
  error: string | null;
  lastTokenCount: number | null;
};

type ChatAction =
  | { type: "LOAD_MESSAGES"; messages: ChatMessage[] }
  | { type: "ADD_USER_MESSAGE"; message: ChatMessage }
  | { type: "START_STREAMING" }
  | { type: "APPEND_STREAMING"; content: string }
  | { type: "FINALIZE_STREAMING"; content: string; tokenCount?: number }
  | { type: "STREAM_ERROR"; error: string }
  | { type: "DELETE_MESSAGE"; id: string }
  | { type: "EDIT_MESSAGE"; id: string; content: string }
  | { type: "REMOVE_AFTER"; id: string }
  | { type: "CLEAR_MESSAGES" }
  | { type: "RESET_STATUS" };

const initialState: ChatState = {
  messages: [],
  streamingContent: "",
  status: "idle",
  error: null,
  lastTokenCount: null,
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "LOAD_MESSAGES":
      return { ...state, messages: action.messages, status: "idle", error: null, streamingContent: "" };
    case "ADD_USER_MESSAGE":
      return { ...state, messages: [...state.messages, action.message], error: null };
    case "START_STREAMING":
      return { ...state, status: "streaming", streamingContent: "", error: null };
    case "APPEND_STREAMING":
      return { ...state, streamingContent: state.streamingContent + action.content };
    case "FINALIZE_STREAMING": {
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: action.content,
        createdAt: new Date().toISOString(),
        tokenCount: action.tokenCount,
      };
      return {
        ...state,
        messages: [...state.messages, assistantMsg],
        streamingContent: "",
        status: "idle",
        lastTokenCount: action.tokenCount ?? null,
      };
    }
    case "STREAM_ERROR":
      return { ...state, status: "error", error: action.error, streamingContent: "" };
    case "DELETE_MESSAGE":
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };
    case "EDIT_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, content: action.content } : m,
        ),
      };
    case "REMOVE_AFTER": {
      const idx = state.messages.findIndex((m) => m.id === action.id);
      return { ...state, messages: idx >= 0 ? state.messages.slice(0, idx + 1) : state.messages };
    }
    case "CLEAR_MESSAGES":
      return { ...initialState };
    case "RESET_STATUS":
      return { ...state, status: "idle", error: null };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// SSE parser — only parses complete lines, returns unconsumed remainder
// ---------------------------------------------------------------------------

type SseEvent = { type: string; content?: string; detail?: string; tokenCount?: number };

function parseSseEvents(text: string): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  const lines = text.split("\n");
  // The last element may be an incomplete line — keep it as remainder
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // skip malformed complete lines
      }
    }
  }
  return { events, remainder };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type UseChatOptions = {
  conversationId: string | null;
  model?: string;
  temperature?: number;
  onStreamComplete?: (messages: ChatMessage[]) => void;
};

export function useChat(options: UseChatOptions) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Keep a ref to current messages so streamChat can read the latest state
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  /**
   * Shared streaming logic used by both `send` and `regenerate`.
   * Handles fetch, SSE parsing, dispatch, abort, and onStreamComplete callback.
   */
  const streamChat = useCallback(async (
    message: string,
    history: Array<{ role: string; content: string }>,
  ) => {
    dispatch({ type: "START_STREAMING" });

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: optionsRef.current.conversationId ?? "temp",
          message,
          model: optionsRef.current.model,
          temperature: optionsRef.current.temperature,
          history,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        dispatch({ type: "STREAM_ERROR", error: errBody?.error ?? `Request failed (${res.status})` });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        dispatch({ type: "STREAM_ERROR", error: "No response stream" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let tokenCount: number | undefined;

      const processEvents = (events: SseEvent[]): boolean => {
        for (const event of events) {
          if (event.type === "token" && event.content) {
            accumulated += event.content;
            dispatch({ type: "APPEND_STREAMING", content: event.content });
          } else if (event.type === "done") {
            tokenCount = event.tokenCount;
          } else if (event.type === "error") {
            dispatch({ type: "STREAM_ERROR", error: event.detail ?? "Stream error" });
            return false; // signal early exit
          }
        }
        return true;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Process any remaining buffered data
          if (buffer) {
            const { events } = parseSseEvents(buffer + "\n");
            if (!processEvents(events)) return;
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSseEvents(buffer);
        buffer = remainder;
        if (!processEvents(events)) return;
      }

      if (accumulated) {
        dispatch({ type: "FINALIZE_STREAMING", content: accumulated, tokenCount });
        // Call onStreamComplete with updated messages (current + new assistant msg)
        const assistantMsg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          role: "assistant",
          content: accumulated,
          createdAt: new Date().toISOString(),
          tokenCount,
        };
        // Use messagesRef to get the latest messages (includes the user message already dispatched)
        const updatedMessages = [...messagesRef.current, assistantMsg];
        optionsRef.current.onStreamComplete?.(updatedMessages);
      } else {
        dispatch({ type: "RESET_STATUS" });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (accumulated) {
          dispatch({ type: "FINALIZE_STREAMING", content: accumulated });
        } else {
          dispatch({ type: "RESET_STATUS" });
        }
      } else {
        dispatch({ type: "STREAM_ERROR", error: "Connection failed" });
      }
    } finally {
      abortRef.current = null;
    }
  }, []);

  const send = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: "ADD_USER_MESSAGE", message: userMsg });

    const history = state.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await streamChat(content, history);
  }, [state.messages, streamChat]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const regenerate = useCallback(async () => {
    const lastUserIdx = [...state.messages].reverse().findIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const idx = state.messages.length - 1 - lastUserIdx;
    const lastUserMsg = state.messages[idx];
    const messagesBeforeUser = state.messages.slice(0, idx);

    dispatch({ type: "LOAD_MESSAGES", messages: [...messagesBeforeUser, lastUserMsg] });

    const history = messagesBeforeUser.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await streamChat(lastUserMsg.content, history);
  }, [state.messages, streamChat]);

  const editMessage = useCallback(async (id: string, content: string) => {
    // Edit first, then remove messages after — so the edited message is kept
    dispatch({ type: "EDIT_MESSAGE", id, content });
    dispatch({ type: "REMOVE_AFTER", id });
  }, []);

  const deleteMessage = useCallback((id: string) => {
    dispatch({ type: "DELETE_MESSAGE", id });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: "CLEAR_MESSAGES" });
  }, []);

  const loadMessages = useCallback((messages: ChatMessage[]) => {
    dispatch({ type: "LOAD_MESSAGES", messages });
  }, []);

  return {
    messages: state.messages,
    streamingContent: state.streamingContent,
    status: state.status,
    error: state.error,
    lastTokenCount: state.lastTokenCount,
    send,
    stop,
    regenerate,
    editMessage,
    deleteMessage,
    clearMessages,
    loadMessages,
  };
}
