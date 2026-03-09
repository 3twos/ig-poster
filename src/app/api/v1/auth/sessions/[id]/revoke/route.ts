import { CliSessionSchema } from "@/lib/api/v1/auth";
import { apiError, apiOk, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { resolveActorFromRequest } from "@/services/actors";
import { CliAuthServiceError, revokeCliSessionById } from "@/services/auth/cli";

export const runtime = "nodejs";

const errorCodeForStatus = (status: CliAuthServiceError["status"]): ApiErrorCode =>
  status === 400
    ? "INVALID_INPUT"
    : status === 401
      ? "AUTH_REQUIRED"
      : status === 404
        ? "NOT_FOUND"
        : "INTERNAL_ERROR";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await context.params;
    const session = await revokeCliSessionById(actor, id);
    return apiOk({ session: CliSessionSchema.parse(session) });
  } catch (error) {
    if (error instanceof CliAuthServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/auth/sessions/:id/revoke]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to revoke CLI session");
  }
}
