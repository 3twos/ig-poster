import {
  putJson,
  readJsonByPath,
  deleteBlobByPath,
} from "@/lib/blob-store";
import type {
  ChatConversation,
  ChatConversationSummary,
} from "@/lib/chat-types";
import { hashEmail } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const chatOwnerHash = (email: string) =>
  hashEmail(email).slice(0, 16);

const conversationPath = (ownerHash: string, id: string) =>
  `chat/${ownerHash}/conversations/${id}.json`;

const indexPath = (ownerHash: string) =>
  `chat/${ownerHash}/index.json`;

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

export async function saveChatConversation(
  conversation: ChatConversation,
): Promise<void> {
  const path = conversationPath(conversation.ownerHash, conversation.id);
  // Save conversation and load index in parallel
  const [, items] = await Promise.all([
    putJson(path, conversation),
    listChatConversations(conversation.ownerHash),
  ]);
  await updateIndex(conversation, items);
}

export async function loadChatConversation(
  ownerHash: string,
  id: string,
): Promise<ChatConversation | null> {
  return readJsonByPath<ChatConversation>(conversationPath(ownerHash, id));
}

export async function deleteChatConversation(
  ownerHash: string,
  id: string,
): Promise<boolean> {
  const deleted = await deleteBlobByPath(conversationPath(ownerHash, id));
  if (deleted) {
    await removeFromIndex(ownerHash, id);
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Index (fast listing without loading every conversation)
// ---------------------------------------------------------------------------

export async function listChatConversations(
  ownerHash: string,
): Promise<ChatConversationSummary[]> {
  const items =
    (await readJsonByPath<ChatConversationSummary[]>(indexPath(ownerHash))) ??
    [];
  return items.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

async function updateIndex(
  conversation: ChatConversation,
  items?: ChatConversationSummary[],
): Promise<void> {
  const resolved = items ?? await listChatConversations(conversation.ownerHash);
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const preview = lastMsg
    ? lastMsg.content.slice(0, 100)
    : "";

  const summary: ChatConversationSummary = {
    id: conversation.id,
    title: conversation.title,
    preview,
    messageCount: conversation.messages.length,
    updatedAt: conversation.updatedAt,
  };

  const filtered = resolved.filter((i) => i.id !== conversation.id);
  filtered.unshift(summary);

  await putJson(indexPath(conversation.ownerHash), filtered);
}

async function removeFromIndex(
  ownerHash: string,
  id: string,
): Promise<void> {
  const items = await listChatConversations(ownerHash);
  const filtered = items.filter((i) => i.id !== id);
  await putJson(indexPath(ownerHash), filtered);
}
