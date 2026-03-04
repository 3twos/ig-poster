import { NextResponse } from "next/server";

import { z } from "zod";

import { readJsonByPath } from "@/lib/blob-store";
import {
  GenerationRequestSchema,
  GenerationResponseSchema,
  InternalGenerationResponseSchema,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  createFallbackResponse,
  selectTopVariants,
} from "@/lib/creative";
import { resolveLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateStructuredJson } from "@/lib/llm";
import {
  getUserSettingsPath,
  type UserSettings,
} from "@/lib/user-settings";
import {
  buildWebsiteStyleContext,
  type WebsiteStyleResult,
} from "@/lib/website-style";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

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

          // Try cached brand memory first, fall back to live scrape
          let websiteResult: WebsiteStyleResult | null = null;
          const normalizeHostname = (rawUrl: string | null | undefined): string | null => {
            if (!rawUrl) return null;
            try {
              const urlStr = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;
              const hostname = new URL(urlStr).hostname.toLowerCase();
              return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
            } catch {
              return null;
            }
          };
          try {
            const session = await readWorkspaceSessionFromRequest(req);
            if (session) {
              const settings = await readJsonByPath<UserSettings>(
                getUserSettingsPath(session.email),
              );
              const mem = settings?.brandMemory;
              const reqHost = normalizeHostname(request.brand.website || "");
              const memHost = normalizeHostname(mem?.websiteUrl);
              if (mem?.bodyText && memHost && reqHost && memHost === reqHost) {
                websiteResult = { notes: mem.notes || "", bodyText: mem.bodyText };
                send({ type: "status", message: "Using cached website context..." });
              }
            }
          } catch {
            // Fall through to live scrape
          }

          if (!websiteResult) {
            send({ type: "status", message: "Extracting website style cues..." });
            websiteResult = await buildWebsiteStyleContext(
              request.brand.website,
            );
          }

          send({ type: "status", message: "Building prompt..." });

          send({
            type: "status",
            message: `Calling ${llmAuth.provider.toUpperCase()} (${llmAuth.model})...`,
          });
          const generated = await generateStructuredJson<unknown>({
            auth: llmAuth,
            systemPrompt: buildGenerationSystemPrompt(request.promptConfig),
            userPrompt: buildGenerationUserPrompt(request, {
              websiteStyleContext: websiteResult?.notes,
              websiteBodyText: websiteResult?.bodyText,
              candidateCount: 6,
            }),
            temperature: 0.9,
            maxTokens: 12000,
          });

          send({ type: "status", message: "Selecting best variants..." });
          const internalParsed = InternalGenerationResponseSchema.parse(generated);
          const topVariants = selectTopVariants(internalParsed.variants, 3);
          const parsed = GenerationResponseSchema.parse({
            strategy: internalParsed.strategy,
            variants: topVariants,
          });

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
