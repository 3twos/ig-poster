import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import {
  deleteLlmConnection,
  LLM_CONNECTION_COOKIE,
  removeFromConnectionCookie,
} from "@/lib/llm-auth";
import { readCookieFromRequest } from "@/lib/cookies";

export const runtime = "nodejs";

const DisconnectSchema = z.object({
  connectionId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = DisconnectSchema.safeParse(body);

    if (!parsed.success) {
      return apiErrorResponse(new Error("connectionId is required"), {
        fallback: "Missing connectionId",
        status: 400,
      });
    }

    const { connectionId } = parsed.data;

    // Cannot disconnect env-sourced models
    if (connectionId.startsWith("env-")) {
      return apiErrorResponse(
        new Error("Environment-configured models cannot be disconnected."),
        { fallback: "Cannot disconnect env model", status: 400 },
      );
    }

    // Delete from DB if it's a stored connection
    if (connectionId !== "inline") {
      await deleteLlmConnection(connectionId);
    }

    // Remove from cookie
    const existingCookie = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
    const updatedCookie = removeFromConnectionCookie(existingCookie, connectionId);

    const response = NextResponse.json({ ok: true });

    if (updatedCookie) {
      response.cookies.set(LLM_CONNECTION_COOKIE, updatedCookie, {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(req.url).protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    } else {
      response.cookies.set(LLM_CONNECTION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(req.url).protocol === "https:",
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Failed to disconnect" });
  }
}
