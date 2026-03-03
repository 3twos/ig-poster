import { NextResponse } from "next/server";

import {
  GenerationRequestSchema,
  GenerationResponseSchema,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  createFallbackResponse,
} from "@/lib/creative";
import { resolveLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateStructuredJson } from "@/lib/llm";
import { buildWebsiteStyleContext } from "@/lib/website-style";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const request = GenerationRequestSchema.parse(json);
    const llmAuth = await resolveLlmAuthFromRequest(req);

    if (!llmAuth) {
      return NextResponse.json(createFallbackResponse(request));
    }

    try {
      const websiteStyleContext = await buildWebsiteStyleContext(request.brand.website);
      const generated = await generateStructuredJson<unknown>({
        auth: llmAuth,
        systemPrompt: buildGenerationSystemPrompt(request.promptConfig),
        userPrompt: buildGenerationUserPrompt(request, {
          websiteStyleContext: websiteStyleContext ?? undefined,
        }),
        temperature: 0.9,
        maxTokens: 8192,
      });

      const parsed = GenerationResponseSchema.parse(generated);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json(createFallbackResponse(request));
    }
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: "Could not generate creative direction",
          detail: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Unexpected failure",
      },
      { status: 500 },
    );
  }
}
