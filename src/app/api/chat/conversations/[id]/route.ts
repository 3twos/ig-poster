import { NextResponse } from "next/server";

import { ChatUpdateConversationRequestSchema } from "@/lib/chat-types";
import {
  chatOwnerHash,
  deleteChatConversation,
  loadChatConversation,
  saveChatConversation,
} from "@/lib/chat-store";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const ownerHash = chatOwnerHash(session.email);
    const conversation = await loadChatConversation(ownerHash, id);
    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch {
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const ownerHash = chatOwnerHash(session.email);
    const existing = await loadChatConversation(ownerHash, id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const json = await req.json();
    const update = ChatUpdateConversationRequestSchema.parse(json);

    const updated = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };

    await saveChatConversation(updated);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const ownerHash = chatOwnerHash(session.email);
    const deleted = await deleteChatConversation(ownerHash, id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
