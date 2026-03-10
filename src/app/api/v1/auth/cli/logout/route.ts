import { z } from "zod";

import { CliAuthRefreshRequestSchema } from "@/lib/api/v1/auth";
import { apiError, apiOk, type ApiErrorCode } from "@/lib/api/v1/envelope";
import {
  CliAuthServiceError,
  revokeCliSessionByRefreshToken,
} from "@/services/auth/cli";

export const runtime = "nodejs";

const errorCodeForStatus = (status: CliAuthServiceError["status"]): ApiErrorCode =>
  status === 400
    ? "INVALID_INPUT"
    : status === 401
      ? "AUTH_REQUIRED"
      : status === 404
        ? "NOT_FOUND"
        : "INTERNAL_ERROR";

export async function POST(req: Request) {
  try {
    const payload = CliAuthRefreshRequestSchema.parse(await req.json());
    const revoked = await revokeCliSessionByRefreshToken(payload.refreshToken);
    return apiOk({ loggedOut: true, revoked });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid CLI logout request");
    }

    if (error instanceof CliAuthServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/auth/cli/logout]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to logout CLI session");
  }
}
