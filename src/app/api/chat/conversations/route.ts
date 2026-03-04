import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { ChatCreateConversationRequestSchema } from "@/lib/chat-types";
import type { ChatConversation } from "@/lib/chat-types";
import {
  chatOwnerHash,
  listChatConversations,
  saveChatConversation,
} from "@/lib/chat-store";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export async function GET(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json([], { status: 200 });
    }

    const ownerHash = chatOwnerHash(session.email);
    const conversations = await listChatConversations(ownerHash);
    return NextResponse.json(conversations);
  } catch {
    return NextResponse.json(
      { error: "Failed to list conversations" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const json = await req.json();
    const input = ChatCreateConversationRequestSchema.parse(json);
    const ownerHash = chatOwnerHash(session.email);
    const now = new Date().toISOString();

    const conversation: ChatConversation = {
      id: `chat_${randomUUID()}`,
      ownerHash,
      title: input.title ?? "New conversation",
      messages: [],
      model: input.model,
      temperature: input.temperature,
      systemPrompt: input.systemPrompt,
      customInstructions: input.customInstructions,
      createdAt: now,
      updatedAt: now,
    };

    await saveChatConversation(conversation);
    return NextResponse.json(conversation, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }
}
