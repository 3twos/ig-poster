import { NextResponse } from "next/server";

import { z } from "zod";

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

export const maxDuration = 60;

const sseEvent = (data: Record<string, unknown>) =>
  `data: ${JSON.stringify(data)}\n\n`;

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const request = GenerationRequestSchema.parse(json);
    const llmAuth = await resolveLlmAuthFromRequest(req);

    if (!llmAuth) {
      return NextResponse.json(createFallbackResponse(request));
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(new TextEncoder().encode(sseEvent(data)));
        };

        try {
          send({ type: "status", message: "Authenticating with provider..." });

          send({ type: "status", message: "Extracting website style cues..." });
          const websiteStyleContext = await buildWebsiteStyleContext(
            request.brand.website,
          );

          send({ type: "status", message: "Building prompt..." });

          send({
            type: "status",
            message: `Calling ${llmAuth.provider.toUpperCase()} (${llmAuth.model})...`,
          });
          const generated = await generateStructuredJson<unknown>({
            auth: llmAuth,
            systemPrompt: buildGenerationSystemPrompt(request.promptConfig),
            userPrompt: buildGenerationUserPrompt(request, {
              websiteStyleContext: websiteStyleContext ?? undefined,
            }),
            temperature: 0.9,
            maxTokens: 8192,
          });

          send({ type: "status", message: "Parsing response..." });
          const parsed = GenerationResponseSchema.parse(generated);

          send({ type: "complete", result: parsed });
        } catch {
          const fallback = createFallbackResponse(request);
          send({
            type: "status",
            message: "LLM call failed, using fallback concepts...",
          });
          send({ type: "complete", result: fallback });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      { error: "Could not generate creative direction" },
      { status },
    );
  }
}
