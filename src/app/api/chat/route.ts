import { NextResponse } from "next/server";
import { z } from "zod";

import { ChatSendRequestSchema, CHAT_HEARTBEAT_INTERVAL_MS, CHAT_SOFT_TIMEOUT_MS } from "@/lib/chat-types";
import type { ChatStreamEvent } from "@/lib/chat-types";
import { streamChatCompletion, toChatSseEvent } from "@/lib/chat-stream";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { getUserSettingsPath, type UserSettings } from "@/lib/user-settings";
import { isAbortError } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import { readJsonByPath } from "@/lib/blob-store";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const request = ChatSendRequestSchema.parse(json);
    const authList = await resolveAllLlmAuthFromRequest(req);
    const llmAuth = authList.connections[0] ?? null;

    if (!llmAuth) {
      return NextResponse.json(
        { error: "No LLM provider connected. Connect one in Settings." },
        { status: 422 },
      );
    }

    // Build system prompt with brand context if available
    let systemPrompt = request.systemPrompt ?? "";
    if (!systemPrompt) {
      try {
        const session = await readWorkspaceSessionFromRequest(req);
        if (session) {
          const settings = await readJsonByPath<UserSettings>(
            getUserSettingsPath(session.email),
          );
          systemPrompt = buildChatSystemPrompt({
            brand: settings?.brand ?? undefined,
            customInstructions: settings?.promptConfig?.customInstructions,
          });
        } else {
          systemPrompt = buildChatSystemPrompt();
        }
      } catch {
        systemPrompt = buildChatSystemPrompt();
      }
    }

    // Prepare message history
    const messages = [
      ...(request.history ?? []),
      { role: "user" as const, content: request.message },
    ];

    const abortController = new AbortController();
    let abortReason: "client" | "timeout" | "transport" | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;
        const encoder = new TextEncoder();

        const closeStream = () => {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // Stream may already be closed
          }
        };

        const send = (event: ChatStreamEvent) => {
          if (streamClosed || (abortController.signal.aborted && abortReason !== "timeout")) {
            return;
          }
          try {
            controller.enqueue(encoder.encode(toChatSseEvent(event)));
          } catch {
            streamClosed = true;
            if (!abortController.signal.aborted) {
              abortReason = "transport";
              abortController.abort();
            }
          }
        };

        const abortFromRequest = () => {
          if (!abortController.signal.aborted) {
            abortReason = "client";
            abortController.abort();
          }
        };
        req.signal.addEventListener("abort", abortFromRequest, { once: true });

        const timeoutId = setTimeout(() => {
          if (abortController.signal.aborted) return;
          abortReason = "timeout";
          abortController.abort();
        }, CHAT_SOFT_TIMEOUT_MS);

        const heartbeatId = setInterval(() => {
          if (abortController.signal.aborted) return;
          send({ type: "heartbeat" });
        }, CHAT_HEARTBEAT_INTERVAL_MS);

        try {
          await streamChatCompletion({
            auth: llmAuth,
            systemPrompt,
            messages,
            temperature: request.temperature ?? 0.7,
            signal: abortController.signal,
            onToken: (content) => send({ type: "token", content }),
            onDone: (tokenCount) => send({ type: "done", tokenCount }),
            onError: (detail) => send({ type: "error", detail }),
          });
        } catch (error) {
          if (isAbortError(error) || abortController.signal.aborted) {
            if (abortReason === "client" || abortReason === null) {
              send({ type: "error", detail: "Generation stopped." });
            } else if (abortReason === "timeout") {
              send({ type: "error", detail: "Response timed out. Please try again." });
            }
            // transport: silently drop
          } else {
            const message = error instanceof Error ? error.message : "Unexpected error";
            send({ type: "error", detail: message });
          }
        } finally {
          clearTimeout(timeoutId);
          clearInterval(heartbeatId);
          req.signal.removeEventListener("abort", abortFromRequest);
          closeStream();
        }
      },
      cancel() {
        if (!abortController.signal.aborted) {
          abortReason = "client";
          abortController.abort();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: "Could not process chat request" },
      { status },
    );
  }
}
