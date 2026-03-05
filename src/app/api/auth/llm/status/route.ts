import { NextResponse } from "next/server";

import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import type { LlmConnectionStatus, LlmMultiAuthStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authList = await resolveAllLlmAuthFromRequest(req);

  const connections: LlmConnectionStatus[] = authList.connections.map((conn) => ({
    id: conn.id,
    source: conn.source,
    provider: conn.provider,
    model: conn.model,
    connected: true,
    removable: conn.source === "connection",
  }));

  const first = authList.connections[0];

  const status: LlmMultiAuthStatus = {
    connections,
    mode: authList.mode,
    connected: connections.length > 0,
    // Legacy compat fields
    source: first?.source ?? null,
    provider: first?.provider,
    model: first?.model,
  };

  return NextResponse.json(status);
}
