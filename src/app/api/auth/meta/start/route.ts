import { NextResponse } from "next/server";

import {
  buildOAuthState,
  createMetaOAuthStartUrl,
  META_OAUTH_STATE_COOKIE,
} from "@/lib/meta-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const origin = requestUrl.origin;
    const state = buildOAuthState();
    const redirectUrl = createMetaOAuthStartUrl(origin, state);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(META_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    const origin = new URL(req.url).origin;
    const message =
      error instanceof Error ? error.message : "Meta OAuth start failed";

    return NextResponse.redirect(
      `${origin}/?auth=error&detail=${encodeURIComponent(message)}`,
    );
  }
}
