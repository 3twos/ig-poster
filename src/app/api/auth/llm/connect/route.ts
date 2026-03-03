import { NextResponse } from "next/server";
import { z } from "zod";

import { buildEncryptedLlmConnection, LLM_CONNECTION_COOKIE } from "@/lib/llm-auth";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  LlmProviderSchema,
} from "@/lib/llm";

export const runtime = "nodejs";

const ConnectLlmSchema = z.object({
  provider: LlmProviderSchema,
  apiKey: z.string().trim().min(8).max(400),
  model: z.string().trim().max(120).optional().default(""),
});

const defaultModelFor = (provider: "openai" | "anthropic") =>
  provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;

export async function POST(req: Request) {
  try {
    const payload = ConnectLlmSchema.parse(await req.json());
    const model = payload.model || defaultModelFor(payload.provider);
    const encrypted = buildEncryptedLlmConnection({
      provider: payload.provider,
      apiKey: payload.apiKey,
      model,
    });

    const response = NextResponse.json({
      connected: true,
      source: "connection",
      provider: payload.provider,
      model,
    });

    response.cookies.set(LLM_CONNECTION_COOKIE, encodeURIComponent(encrypted), {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not connect LLM provider",
        detail: error instanceof Error ? error.message : "Unexpected connection failure",
      },
      { status: 400 },
    );
  }
}
