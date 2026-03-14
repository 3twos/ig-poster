import { NextResponse } from "next/server";

import { safeErrorDetail } from "@/lib/api-error";
import {
  buildOAuthState,
  createMetaOAuthStartUrl,
  META_OAUTH_STATE_COOKIE,
  type MetaOAuthScopeProfile,
} from "@/lib/meta-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const origin = requestUrl.origin;
    const state = buildOAuthState();
    const requestedScopeProfile = requestUrl.searchParams.get("scopeProfile");
    const scopeProfile: MetaOAuthScopeProfile =
      requestedScopeProfile === "instagram-basic"
        ? "instagram-basic"
        : "page-publishing";
    const redirectUrl = createMetaOAuthStartUrl(origin, state, {
      scopeProfile,
    });

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
    const message = safeErrorDetail(error, "Meta OAuth start failed");

    return NextResponse.redirect(
      `${origin}/?auth=error&detail=${encodeURIComponent(message)}`,
    );
  }
}
