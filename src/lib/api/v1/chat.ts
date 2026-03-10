import { z } from "zod";

import { ChatRoleSchema } from "@/lib/chat-types";

export const ChatHistoryEntrySchema = z
  .object({
    role: ChatRoleSchema,
    content: z.string().trim().min(1).max(32_000),
  })
  .strict();

export const ChatAskBodySchema = z
  .object({
    message: z.string().trim().min(1).max(32_000),
    postId: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    systemPrompt: z.string().trim().max(8_000).optional(),
    history: z.array(ChatHistoryEntrySchema).max(200).optional(),
  })
  .strict();

export type ChatAskBody = z.infer<typeof ChatAskBodySchema>;
