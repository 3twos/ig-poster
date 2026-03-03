import { NextResponse } from "next/server";

import {
  completeWorkspaceOAuth,
  createWorkspaceSessionToken,
  sanitizeNextPath,
  WORKSPACE_OAUTH_NEXT_COOKIE,
  WORKSPACE_OAUTH_NONCE_COOKIE,
  WORKSPACE_OAUTH_STATE_COOKIE,
  WORKSPACE_SESSION_COOKIE,
  WORKSPACE_SESSION_TTL_SECONDS,
} from "@/lib/workspace-auth";
import { readCookieFromRequest } from "@/lib/cookies";

export const runtime = "nodejs";

const clearOAuthCookies = (response: NextResponse, secure: boolean) => {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(WORKSPACE_OAUTH_STATE_COOKIE, "", options);
  response.cookies.set(WORKSPACE_OAUTH_NONCE_COOKIE, "", options);
  response.cookies.set(WORKSPACE_OAUTH_NEXT_COOKIE, "", options);
};

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const origin = requestUrl.origin;
  const secure = requestUrl.protocol === "https:";

  try {
    const oauthError =
      requestUrl.searchParams.get("error_description") ??
      requestUrl.searchParams.get("error");
    if (oauthError) {
      return NextResponse.json(
        { error: "Google OAuth callback failed", detail: oauthError },
        { status: 400 },
      );
    }

    const state = requestUrl.searchParams.get("state") ?? "";
    const code = requestUrl.searchParams.get("code") ?? "";
    const expectedState = readCookieFromRequest(req, WORKSPACE_OAUTH_STATE_COOKIE);
    const expectedNonce = readCookieFromRequest(req, WORKSPACE_OAUTH_NONCE_COOKIE);
    const nextPath = sanitizeNextPath(
      readCookieFromRequest(req, WORKSPACE_OAUTH_NEXT_COOKIE),
    );

    if (!state || !code) {
      throw new Error("Missing OAuth code or state");
    }

    if (!expectedState || state !== expectedState) {
      throw new Error("Invalid OAuth state");
    }

    if (!expectedNonce) {
      throw new Error("Missing OAuth nonce");
    }

    const identity = await completeWorkspaceOAuth(req, code, expectedNonce);
    const token = await createWorkspaceSessionToken(identity);
    const response = NextResponse.redirect(new URL(nextPath, origin));

    response.cookies.set(WORKSPACE_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: WORKSPACE_SESSION_TTL_SECONDS,
    });

    clearOAuthCookies(response, secure);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      {
        error: "Google Workspace login failed",
        detail: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 401 },
    );

    clearOAuthCookies(response, secure);
    response.cookies.set(WORKSPACE_SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });

    return response;
  }
}
