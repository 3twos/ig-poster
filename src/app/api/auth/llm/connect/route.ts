import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api-error";
import {
  buildMultiConnectionCookieValue,
  LLM_CONNECTION_COOKIE,
  saveLlmConnection,
} from "@/lib/llm-auth";
import { validateLlmCredentials } from "@/lib/llm";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  LlmProviderSchema,
} from "@/lib/llm-constants";
import { readCookieFromRequest } from "@/lib/cookies";

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

    // Build updated cookie value (appends to existing connections)
    const existingCookie = readCookieFromRequest(req, LLM_CONNECTION_COOKIE);
    const newCookieValue = buildMultiConnectionCookieValue(
      existingCookie,
      connection,
    );

    const response = NextResponse.json({
      connected: true,
      source: "connection",
      provider: payload.provider,
      model: validatedModel,
      storage: connection.storage,
      connectionId: connection.connectionId,
    });

    response.cookies.set(LLM_CONNECTION_COOKIE, newCookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(req.url).protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    return apiErrorResponse(error, {
      fallback: "Could not connect LLM provider",
      status: 400,
    });
  }
}
