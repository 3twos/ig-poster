import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/api-error";
import {
  deleteLlmConnection,
  getStoredConnectionIdFromCookie,
  LLM_CONNECTION_COOKIE,
} from "@/lib/llm-auth";
import { readCookieFromRequest } from "@/lib/cookies";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const connectionId = getStoredConnectionIdFromCookie(
      readCookieFromRequest(req, LLM_CONNECTION_COOKIE),
    );
    if (connectionId) {
      await deleteLlmConnection(connectionId);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(LLM_CONNECTION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Failed to disconnect" });
  }
}
