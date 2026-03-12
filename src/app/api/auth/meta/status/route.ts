import { NextResponse } from "next/server";

import { resolveActorFromRequest } from "@/services/actors";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    const resolved = await resolveMetaAuthForRequest(req, {
      ownerHash: actor?.ownerHash,
    });

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
