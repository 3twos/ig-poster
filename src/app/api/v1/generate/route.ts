import { z } from "zod";

import { POST as generatePost } from "@/app/api/generate/route";
import { GenerateRunBodySchema } from "@/lib/api/v1/generate";
import { apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { resolveActorFromRequest } from "@/services/actors";
import {
  buildGenerationRequestFromPost,
  GenerationServiceError,
} from "@/services/generation";

export const runtime = "nodejs";
export const maxDuration = 60;

const errorCodeForStatus = (status: number): ApiErrorCode =>
  status === 400
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

    const parsed = GenerateRunBodySchema.parse(await req.json());
    const generationRequest =
      "postId" in parsed
        ? await buildGenerationRequestFromPost(actor, parsed.postId)
        : "request" in parsed
          ? parsed.request
          : parsed;

    return generatePost(
      new Request(new URL("/api/generate", req.url), {
        method: "POST",
        headers: new Headers(req.headers),
        body: JSON.stringify(generationRequest),
        signal: req.signal,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid generation request");
    }

    if (error instanceof GenerationServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/generate]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to start generation");
  }
}
