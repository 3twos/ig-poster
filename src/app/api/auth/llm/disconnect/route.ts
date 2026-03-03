import { NextResponse } from "next/server";

import { LLM_CONNECTION_COOKIE } from "@/lib/llm-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LLM_CONNECTION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 0,
  });

  return response;
}
