import { NextResponse } from "next/server";

import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await readWorkspaceSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      email: session.email,
      name: session.name,
      picture: session.picture,
      domain: session.domain,
      expiresAt: session.expiresAt,
    },
  });
}
