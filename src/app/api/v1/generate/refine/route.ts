import { z } from "zod";

import { POST as refinePost } from "@/app/api/generate/refine/route";
import { GenerateRefineBodySchema } from "@/lib/api/v1/generate";
import { apiError, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { resolveActorFromRequest } from "@/services/actors";
import {
  buildRefineRequestFromPost,
  GenerationServiceError,
} from "@/services/generation";

export const runtime = "nodejs";

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

    const parsed = GenerateRefineBodySchema.parse(await req.json());
    const refineRequest =
      "postId" in parsed
        ? {
            ...(await buildRefineRequestFromPost({
              actor,
              postId: parsed.postId,
              variantId: parsed.variantId,
            })),
            instruction: parsed.instruction,
          }
        : parsed;

    return refinePost(
      new Request(new URL("/api/generate/refine", req.url), {
        method: "POST",
        headers: new Headers(req.headers),
        body: JSON.stringify(refineRequest),
        signal: req.signal,
      }),
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid refine request");
    }

    if (error instanceof GenerationServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/generate/refine]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to refine generation");
  }
}
