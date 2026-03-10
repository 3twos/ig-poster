import { z } from "zod";

import { ChatAskBodySchema } from "@/lib/api/v1/chat";
import { apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { resolveActorFromRequest } from "@/services/actors";
import { ChatServiceError, startChatStream } from "@/services/chat";

export const runtime = "nodejs";
export const maxDuration = 120;

const errorCodeForStatus = (status: number): ApiErrorCode =>
  status === 400 || status === 422
    ? "INVALID_INPUT"
    : status === 401
      ? "AUTH_REQUIRED"
      : status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "CONFLICT"
          : "INTERNAL_ERROR";

export async function POST(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const input = ChatAskBodySchema.parse(await req.json());
    return await startChatStream({ actor, input, req });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid chat request");
    }

    if (error instanceof ChatServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/chat]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to start chat");
  }
}
