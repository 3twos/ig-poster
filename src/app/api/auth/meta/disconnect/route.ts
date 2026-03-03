import { NextResponse } from "next/server";

import {
  deleteMetaConnection,
  META_CONNECTION_COOKIE,
  readCookieFromRequest,
} from "@/lib/meta-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const connectionId = readCookieFromRequest(req, META_CONNECTION_COOKIE);

  if (connectionId) {
    await deleteMetaConnection(connectionId);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(META_CONNECTION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });

  return response;
}
