import {
  CHAT_HEARTBEAT_INTERVAL_MS,
  CHAT_SOFT_TIMEOUT_MS,
  type ChatStreamEvent,
} from "@/lib/chat-types";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { streamChatCompletion, toChatSseEvent } from "@/lib/chat-stream";
import { GenerationResponseSchema } from "@/lib/creative";
import { readJsonByPath } from "@/lib/blob-store";
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { isAbortError } from "@/lib/server-utils";
import type { BrandState } from "@/lib/types";
import { getUserSettingsPath, type UserSettings } from "@/lib/user-settings";
import type { ChatAskBody } from "@/lib/api/v1/chat";
import type { Actor } from "@/services/actors";
import { getPost } from "@/services/posts";

export class ChatServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatServiceError";
    this.status = status;
  }
}

const readActorSettings = async (actor: Actor) => {
  try {
    return (
      (await readJsonByPath<UserSettings>(getUserSettingsPath(actor.email))) ??
      null
    );
  } catch {
    return null;
  }
};

const asRecord = (value: unknown) =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asTrimmedString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const resolveActiveVariant = (post: Awaited<ReturnType<typeof getPost>>) => {
  const parsed = GenerationResponseSchema.safeParse(post?.result ?? undefined);
  if (!parsed.success || parsed.data.variants.length === 0) {
    return null;
  }

  return (
    (post?.activeVariantId
      ? parsed.data.variants.find(
          (candidate) => candidate.id === post.activeVariantId,
        )
      : undefined) ?? parsed.data.variants[0]
  );
};

const buildPostContext = (
  post: NonNullable<Awaited<ReturnType<typeof getPost>>>,
) => {
  const lines = ["## Linked Post Context"];
  const brief = asRecord(post.brief);
  const publishSettings = asRecord(post.publishSettings);
  const brand = asRecord(post.brand);
  const activeVariant = resolveActiveVariant(post);

  const pushLine = (label: string, value: unknown) => {
    const text = asTrimmedString(value);
    if (text) {
      lines.push(`${label}: ${text}`);
    }
  };

  pushLine("Post ID", post.id);
  pushLine("Title", post.title);
  pushLine("Status", post.status);
  pushLine("Brand", brand?.brandName);

  pushLine("Theme", brief?.theme);
  pushLine("Subject", brief?.subject);
  pushLine("Objective", brief?.objective);
  pushLine("Audience", brief?.audience);
  pushLine("Mood", brief?.mood);
  pushLine("Aspect Ratio", brief?.aspectRatio);
  pushLine("Thought", brief?.thought);

  if (activeVariant) {
    lines.push("Active variant:");
    pushLine("Variant Name", activeVariant.name);
    pushLine("Post Type", activeVariant.postType);
    pushLine("Hook", activeVariant.hook);
    pushLine("Headline", activeVariant.headline);
    pushLine("Supporting Text", activeVariant.supportingText);
    pushLine("CTA", activeVariant.cta);
    pushLine("Caption", activeVariant.caption);
    if (activeVariant.hashtags.length > 0) {
      lines.push(`Hashtags: ${activeVariant.hashtags.join(" ")}`);
    }
  }

  const draftedCaption = asTrimmedString(publishSettings?.caption);
  if (draftedCaption && draftedCaption !== activeVariant?.caption) {
    lines.push(`Draft caption: ${draftedCaption}`);
  }

  if ((post.assets ?? []).length > 0) {
    lines.push(`Asset count: ${post.assets.length}`);
  }

  return lines.join("\n");
};

const buildSystemPrompt = async (
  actor: Actor,
  input: ChatAskBody,
): Promise<string> => {
  const [settings, linkedPost] = await Promise.all([
    readActorSettings(actor),
    input.postId ? getPost(actor, input.postId) : Promise.resolve(null),
  ]);

  if (input.postId && !linkedPost) {
    throw new ChatServiceError(404, "Post not found.");
  }

  const postPromptConfig = asRecord(linkedPost?.promptConfig);
  let systemPrompt = buildChatSystemPrompt({
    brand:
      (settings?.brand as Partial<BrandState> | undefined) ??
      (linkedPost?.brand as Partial<BrandState> | undefined),
    customInstructions:
      settings?.promptConfig?.customInstructions ||
      asTrimmedString(postPromptConfig?.customInstructions) ||
      undefined,
    systemPromptOverride: input.systemPrompt,
  });

  if (linkedPost) {
    systemPrompt = `${systemPrompt}\n\n${buildPostContext(linkedPost)}`;
  }

  return systemPrompt;
};

const buildChatMessages = (input: ChatAskBody) => [
  ...(input.history ?? []),
  { role: "user" as const, content: input.message },
];

export const startChatStream = async (params: {
  actor: Actor;
  input: ChatAskBody;
  req: Request;
}) => {
  const authList = await resolveAllLlmAuthFromRequest(params.req);
  const llmAuth = authList.connections[0] ?? null;

  if (!llmAuth) {
    throw new ChatServiceError(
      422,
      "No LLM provider connected. Connect one in Settings.",
    );
  }

  const systemPrompt = await buildSystemPrompt(params.actor, params.input);
  const messages = buildChatMessages(params.input);
  const abortController = new AbortController();
  let abortReason: "client" | "timeout" | "transport" | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      const encoder = new TextEncoder();

      const closeStream = () => {
        if (streamClosed) {
          return;
        }
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // The response stream may already be closed.
        }
      };

      const send = (event: ChatStreamEvent) => {
        if (
          streamClosed ||
          (abortController.signal.aborted && abortReason !== "timeout")
        ) {
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
      params.req.signal.addEventListener("abort", abortFromRequest, {
        once: true,
      });

      const timeoutId = setTimeout(() => {
        if (abortController.signal.aborted) {
          return;
        }
        abortReason = "timeout";
        abortController.abort();
      }, CHAT_SOFT_TIMEOUT_MS);

      const heartbeatId = setInterval(() => {
        if (abortController.signal.aborted) {
          return;
        }
        send({ type: "heartbeat" });
      }, CHAT_HEARTBEAT_INTERVAL_MS);

      try {
        await streamChatCompletion({
          auth: llmAuth,
          systemPrompt,
          messages,
          temperature: params.input.temperature ?? 0.7,
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
            send({
              type: "error",
              detail: "Response timed out. Please try again.",
            });
          }
        } else {
          send({
            type: "error",
            detail:
              error instanceof Error ? error.message : "Unexpected error",
          });
        }
      } finally {
        clearTimeout(timeoutId);
        clearInterval(heartbeatId);
        params.req.signal.removeEventListener("abort", abortFromRequest);
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
};
