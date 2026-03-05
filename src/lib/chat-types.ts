import { z } from "zod";

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

export const ChatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: ChatRoleSchema,
  content: z.string(),
  createdAt: z.string().datetime(),
  tokenCount: z.number().int().min(0).optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export const ChatConversationSchema = z.object({
  id: z.string().min(1),
  ownerHash: z.string().min(1),
  title: z.string().max(120).default("New conversation"),
  messages: z.array(ChatMessageSchema).default([]),
  model: z.string().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().max(8000).optional(),
  customInstructions: z.string().max(4000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChatConversation = z.infer<typeof ChatConversationSchema>;

// ---------------------------------------------------------------------------
// Conversation summary (for sidebar list)
// ---------------------------------------------------------------------------

export const ChatConversationSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  preview: z.string().max(120).default(""),
  messageCount: z.number().int().min(0),
  updatedAt: z.string().datetime(),
});
export type ChatConversationSummary = z.infer<
  typeof ChatConversationSummarySchema
>;

// ---------------------------------------------------------------------------
// API: Send message request
// ---------------------------------------------------------------------------

export const ChatSendRequestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1).max(32_000),
  model: z.string().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().max(8000).optional(),
  history: z
    .array(
      z.object({
        role: ChatRoleSchema,
        content: z.string(),
      }),
    )
    .max(200)
    .optional(),
});
export type ChatSendRequest = z.infer<typeof ChatSendRequestSchema>;

// ---------------------------------------------------------------------------
// API: Create conversation request
// ---------------------------------------------------------------------------

export const ChatCreateConversationRequestSchema = z.object({
  title: z.string().trim().max(120).optional(),
  model: z.string().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().max(8000).optional(),
  customInstructions: z.string().max(4000).optional(),
});

// ---------------------------------------------------------------------------
// API: Update conversation request
// ---------------------------------------------------------------------------

export const ChatUpdateConversationRequestSchema = z.object({
  title: z.string().trim().max(120).optional(),
  messages: z.array(ChatMessageSchema).optional(),
  model: z.string().max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().max(8000).optional(),
  customInstructions: z.string().max(4000).optional(),
});

// ---------------------------------------------------------------------------
// SSE streaming events
// ---------------------------------------------------------------------------

export type ChatStreamEvent =
  | { type: "token"; content: string }
  | { type: "done"; tokenCount?: number }
  | { type: "error"; detail: string }
  | { type: "heartbeat" };

// ---------------------------------------------------------------------------
// API: Auto-title request
// ---------------------------------------------------------------------------

export const ChatTitleRequestSchema = z.object({
  firstMessage: z.string().trim().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Client-side types
// ---------------------------------------------------------------------------

export type ChatStreamingStatus = "idle" | "streaming" | "error";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_CHAT_TEMPERATURE = 0.7;
export const MAX_CHAT_MESSAGES = 200;
export const CHAT_HEARTBEAT_INTERVAL_MS = 2_500;
export const CHAT_SOFT_TIMEOUT_MS = 90_000;
