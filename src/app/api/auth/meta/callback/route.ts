import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { safeErrorDetail } from "@/lib/api-error";
import {
  completeMetaOAuth,
  META_CONNECTION_COOKIE,
  META_OAUTH_STATE_COOKIE,
} from "@/lib/meta-auth";
import { readCookieFromRequest } from "@/lib/cookies";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  try {
    const errorMessage =
      url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (errorMessage) {
      return NextResponse.redirect(
        `${origin}/?auth=error&detail=${encodeURIComponent(errorMessage)}`,
      );
    }

    const state = url.searchParams.get("state") ?? "";
    const code = url.searchParams.get("code") ?? "";

    if (!state || !code) {
      return NextResponse.redirect(
        `${origin}/?auth=error&detail=${encodeURIComponent("Missing OAuth code or state")}`,
      );
    }

    const expectedState = readCookieFromRequest(req, META_OAUTH_STATE_COOKIE);
    const stateMatch =
      expectedState &&
      expectedState.length === state.length &&
      timingSafeEqual(Buffer.from(expectedState), Buffer.from(state));
    if (!stateMatch) {
      return NextResponse.redirect(
        `${origin}/?auth=error&detail=${encodeURIComponent("Invalid OAuth state")}`,
      );
    }

    const connection = await completeMetaOAuth(req, code);

    const response = NextResponse.redirect(`${origin}/?auth=connected`);

    response.cookies.set(META_CONNECTION_COOKIE, connection.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    response.cookies.set(META_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    const message = safeErrorDetail(error, "Meta OAuth callback failed");

    return NextResponse.redirect(
      `${origin}/?auth=error&detail=${encodeURIComponent(message)}`,
    );
  }
}
