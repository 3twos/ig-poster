import { NextResponse } from "next/server";

import { resolveLlmAuthFromRequest } from "@/lib/llm-auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const resolved = await resolveLlmAuthFromRequest(req);
  if (!resolved) {
    return NextResponse.json({
      connected: false,
      source: null,
      detail: "No connected provider. Add OpenAI/Anthropic key or set env credentials.",
    });
  }

  return NextResponse.json({
    connected: true,
    source: resolved.source,
    provider: resolved.provider,
    model: resolved.model,
  });
}
