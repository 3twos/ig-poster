import { z } from "zod";

import { apiError, apiOk, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { PublishLocationQuerySchema } from "@/lib/api/v1/publish";
import { searchMetaLocations } from "@/lib/meta";
import { resolveActorFromRequest } from "@/services/actors";
import {
  MetaAuthServiceError,
  resolveMetaAuthForApi,
} from "@/services/meta-auth";

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

export async function GET(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const url = new URL(req.url);
    const query = PublishLocationQuerySchema.parse({
      q: url.searchParams.get("q") ?? "",
      connectionId: url.searchParams.get("connectionId") ?? undefined,
    });
    const resolvedAuth = await resolveMetaAuthForApi({
      connectionId: query.connectionId,
      ownerHash: actor.ownerHash,
    });
    const locations = await searchMetaLocations(query.q, resolvedAuth.auth);

    return apiOk({ locations });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(400, "INVALID_INPUT", "Invalid Meta location query");
    }

    if (error instanceof MetaAuthServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/meta/locations]", error);
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Could not search Meta locations",
    );
  }
}
