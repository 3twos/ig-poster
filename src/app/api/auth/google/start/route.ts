import { NextResponse } from "next/server";

import {
  buildWorkspaceOAuthNonce,
  buildWorkspaceOAuthState,
  createWorkspaceOAuthStartUrl,
  sanitizeNextPath,
  WORKSPACE_OAUTH_NEXT_COOKIE,
  WORKSPACE_OAUTH_NONCE_COOKIE,
  WORKSPACE_OAUTH_STATE_COOKIE,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url);
    const origin = requestUrl.origin;
    const state = buildWorkspaceOAuthState();
    const nonce = buildWorkspaceOAuthNonce();
    const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));
    const redirectUrl = createWorkspaceOAuthStartUrl(origin, state, nonce);

    const response = NextResponse.redirect(redirectUrl);
    const secure = requestUrl.protocol === "https:";

    response.cookies.set(WORKSPACE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 10,
    });
    response.cookies.set(WORKSPACE_OAUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 10,
    });
    response.cookies.set(WORKSPACE_OAUTH_NEXT_COOKIE, nextPath, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Google OAuth start failed",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 400 },
    );
  }
}
