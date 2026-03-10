import { z } from "zod";

import {
  CliAuthExchangeRequestSchema,
  CliAuthTokensSchema,
} from "@/lib/api/v1/auth";
import { apiError, apiOk, type ApiErrorCode } from "@/lib/api/v1/envelope";
import {
  CliAuthServiceError,
  exchangeCliAuthorizationCode,
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
    const payload = CliAuthExchangeRequestSchema.parse(await req.json());
    const tokens = await exchangeCliAuthorizationCode({
      code: payload.code,
      codeVerifier: payload.codeVerifier,
      label: payload.label,
      userAgent: req.headers.get("user-agent"),
    });

    return apiOk(CliAuthTokensSchema.parse(tokens), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid CLI auth exchange request");
    }

    if (error instanceof CliAuthServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/auth/cli/exchange]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to exchange CLI auth code");
  }
}
