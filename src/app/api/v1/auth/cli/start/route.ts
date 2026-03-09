import { NextResponse } from "next/server";
import { z } from "zod";

import { WORKSPACE_SCOPES } from "@/lib/auth-scopes";
import { apiError } from "@/lib/api/v1/envelope";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";
import {
  createCliAuthorizationCode,
  CliAuthServiceError,
  ensureCliAuthReady,
} from "@/services/auth/cli";

export const runtime = "nodejs";

const StartQuerySchema = z.object({
  challenge: z.string().min(43).max(128),
  state: z.string().min(8).max(200),
  redirect_uri: z.string().url(),
});

const errorCodeForStatus = (status: CliAuthServiceError["status"]) =>
  status === 400 ? "INVALID_INPUT" : "INTERNAL_ERROR";

export async function GET(req: Request) {
  try {
    ensureCliAuthReady();

    const requestUrl = new URL(req.url);
    const query = StartQuerySchema.parse({
      challenge: requestUrl.searchParams.get("challenge"),
      state: requestUrl.searchParams.get("state"),
      redirect_uri: requestUrl.searchParams.get("redirect_uri"),
    });

    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      const loginUrl = new URL("/api/auth/google/start", requestUrl.origin);
      loginUrl.searchParams.set(
        "next",
        `${requestUrl.pathname}${requestUrl.search}`,
      );
      return NextResponse.redirect(loginUrl);
    }

    const code = await createCliAuthorizationCode({
      actor: {
        type: "workspace-user",
        subjectId: session.sub,
        email: session.email,
        domain: session.domain,
        ownerHash: hashEmail(session.email),
        authSource: "cookie",
        scopes: [...WORKSPACE_SCOPES],
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      },
      codeChallenge: query.challenge,
      redirectUri: query.redirect_uri,
    });

    const callbackUrl = new URL(query.redirect_uri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", query.state);
    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(400, "INVALID_INPUT", "Invalid CLI auth start request");
    }

    if (error instanceof CliAuthServiceError) {
      return apiError(
        error.status,
        errorCodeForStatus(error.status),
        error.message,
      );
    }

    console.error("[api/v1/auth/cli/start]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to start CLI login");
  }
}
