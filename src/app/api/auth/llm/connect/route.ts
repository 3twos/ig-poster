import { NextResponse } from "next/server";
import { z } from "zod";

import { LLM_CONNECTION_COOKIE, saveLlmConnection } from "@/lib/llm-auth";
import { validateLlmCredentials } from "@/lib/llm";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  LlmProviderSchema,
} from "@/lib/llm-constants";

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
    const validatedModel = await validateLlmCredentials({
      provider: payload.provider,
      apiKey: payload.apiKey,
      model,
    });
    const connection = await saveLlmConnection({
      provider: payload.provider,
      apiKey: payload.apiKey,
      model: validatedModel,
    });

    const response = NextResponse.json({
      connected: true,
      source: "connection",
      provider: payload.provider,
      model: validatedModel,
      storage: connection.storage,
    });

    response.cookies.set(LLM_CONNECTION_COOKIE, connection.cookieValue, {
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
