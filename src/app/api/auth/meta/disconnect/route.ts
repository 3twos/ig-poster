import { NextResponse } from "next/server";

import {
  deleteMetaConnection,
  META_CONNECTION_COOKIE,
} from "@/lib/meta-auth";
import { readCookieFromRequest } from "@/lib/cookies";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
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
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to disconnect", detail: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
