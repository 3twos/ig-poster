import { z } from "zod";

import {
  CliDeviceCodePollRequestSchema,
  CliDeviceCodePollSchema,
} from "@/lib/api/v1/auth";
import { apiError, apiOk, type ApiErrorCode } from "@/lib/api/v1/envelope";
import { CliAuthServiceError, pollCliDeviceCode } from "@/services/auth/cli";

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
    const payload = CliDeviceCodePollRequestSchema.parse(await req.json());
    const result = await pollCliDeviceCode(
      payload.deviceCode,
      req.headers.get("user-agent"),
    );

    return apiOk(CliDeviceCodePollSchema.parse(result));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid CLI device-code poll request");
    }

    if (error instanceof CliAuthServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/auth/cli/poll]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to poll CLI device code");
  }
}
