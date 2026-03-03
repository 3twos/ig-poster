import { NextResponse } from "next/server";

import {
  sanitizeNextPath,
  WORKSPACE_SESSION_COOKIE,
} from "@/lib/workspace-auth";

export const runtime = "nodejs";

const clearSessionCookie = (response: NextResponse, secure: boolean) => {
  response.cookies.set(WORKSPACE_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
};

export async function POST(req: Request) {
  const secure = new URL(req.url).protocol === "https:";
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, secure);
  return response;
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const secure = requestUrl.protocol === "https:";
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(nextPath, requestUrl.origin));
  clearSessionCookie(response, secure);
  return response;
}
