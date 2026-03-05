import { NextResponse } from "next/server";

import { ChatTitleRequestSchema } from "@/lib/chat-types";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateWithFallback } from "@/lib/llm";

const truncateTitle = (text: string, maxLen = 50) => {
  const trimmed = text.slice(0, maxLen).trim();
  return text.length > maxLen ? `${trimmed}...` : trimmed;
};

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const { firstMessage } = ChatTitleRequestSchema.parse(json);

    const authList = await resolveAllLlmAuthFromRequest(req);

    if (authList.connections.length === 0) {
      return NextResponse.json({ title: truncateTitle(firstMessage) });
    }

    try {
      const { result } = await generateWithFallback<{ title: string }>(
        authList.connections,
        (auth) => ({
          auth,
          systemPrompt:
            "You generate very short conversation titles. Respond with JSON: { \"title\": \"...\" }. The title must be 3-6 words, no quotes, no punctuation at the end.",
          userPrompt: `Generate a short title for a conversation that starts with this message:\n\n"${firstMessage.slice(0, 500)}"`,
          temperature: 0.3,
          maxTokens: 100,
        }),
      );

      const title =
        typeof result?.title === "string" && result.title.trim()
          ? result.title.trim().slice(0, 80)
          : truncateTitle(firstMessage);

      return NextResponse.json({ title });
    } catch {
      return NextResponse.json({ title: truncateTitle(firstMessage) });
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to generate title" },
      { status: 500 },
    );
  }
}
