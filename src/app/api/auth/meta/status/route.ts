import { NextResponse } from "next/server";

import { resolveMetaAuthFromRequest } from "@/lib/meta-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const resolved = await resolveMetaAuthFromRequest(req);

    return NextResponse.json({
      connected: true,
      source: resolved.source,
      account: resolved.account,
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      source: null,
      detail: error instanceof Error ? error.message : "Not connected",
    });
  }
}
