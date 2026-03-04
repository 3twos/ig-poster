import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { z } from "zod";

import { listBlobs, readJsonByPath } from "@/lib/blob-store";
import {
  coerceInternalGenerationResponse,
  GenerationRequestSchema,
  GenerationResponseSchema,
  PublishOutcomeSchema,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  buildPerformanceContext,
  createFallbackResponse,
  scoreVariantsWithLlm,
  selectTopVariants,
  selectTopVariantsWithScores,
  type CreativeVariant,
  type PublishOutcome,
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
import {
  type GenerationRunEvent,
  type GenerationStepPhase,
  toSseEvent,
} from "@/lib/generation-events";

export const maxDuration = 60;
const GENERATION_SOFT_TIMEOUT_MS = 50_000;

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected generation issue";

const isAbortError = (error: unknown) =>
  error instanceof Error &&
  (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

const createAbortError = () => {
  const error = new Error("Generation cancelled.");
  error.name = "AbortError";
  return error;
};

const isMiniModel = (model: string) => model.toLowerCase().includes("mini");
const resolveGenerationTemperature = (model: string) =>
  isMiniModel(model) ? 0.45 : 0.7;
const resolveCandidateCount = (model: string) => (isMiniModel(model) ? 4 : 6);
const resolveGenerationMaxTokens = (model: string) =>
  isMiniModel(model) ? 9_000 : 12_000;

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const request = GenerationRequestSchema.parse(json);
    const llmAuth = await resolveLlmAuthFromRequest(req);

    if (!llmAuth) {
      return NextResponse.json(createFallbackResponse(request));
    }

    const generationAbortController = new AbortController();
    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;
        let abortReason: "client" | "timeout" | "transport" | null = null;
        const encoder = new TextEncoder();
        const closeStream = () => {
          if (streamClosed) {
            return;
          }

          streamClosed = true;
          try {
            controller.close();
          } catch {
            // Stream may already be closed by runtime cancellation.
          }
        };
        const send = (event: GenerationRunEvent) => {
          if (streamClosed || generationAbortController.signal.aborted) {
            return;
          }

          try {
            controller.enqueue(encoder.encode(toSseEvent(event)));
          } catch {
            streamClosed = true;
            if (!generationAbortController.signal.aborted) {
              abortReason = "transport";
              generationAbortController.abort();
            }
          }
        };
        const runId = crypto.randomUUID();
        let activeStepId: string | null = null;
        let activeStepTitle: string | null = null;
        const abortFromRequest = () => {
          if (!generationAbortController.signal.aborted) {
            abortReason = "client";
            generationAbortController.abort();
          }
        };
        req.signal.addEventListener("abort", abortFromRequest, { once: true });
        const timeoutId = setTimeout(() => {
          if (generationAbortController.signal.aborted) {
            return;
          }

          abortReason = "timeout";
          generationAbortController.abort();
        }, GENERATION_SOFT_TIMEOUT_MS);

        const throwIfAborted = () => {
          if (generationAbortController.signal.aborted) {
            throw createAbortError();
          }
        };

        const startStep = (
          stepId: string,
          title: string,
          phase: GenerationStepPhase,
          detail?: string,
        ) => {
          activeStepId = stepId;
          activeStepTitle = title;
          send({ type: "step-start", stepId, title, phase, detail });
        };

        const completeStep = (stepId: string, detail?: string) => {
          send({ type: "step-complete", stepId, detail });
          if (activeStepId === stepId) {
            activeStepId = null;
            activeStepTitle = null;
          }
        };

        const failStep = (stepId: string, detail: string) => {
          send({ type: "step-error", stepId, detail });
          if (activeStepId === stepId) {
            activeStepId = null;
            activeStepTitle = null;
          }
        };

        try {
          throwIfAborted();
          send({
            type: "run-start",
            runId,
            label: "Generate SOTA Concepts",
            detail: "Planning and drafting post concepts.",
          });

          startStep(
            "resolve-provider",
            "Resolve model provider",
            "planning",
            "Authenticating model connection and runtime credentials.",
          );
          completeStep(
            "resolve-provider",
            `Connected to ${llmAuth.provider.toUpperCase()} (${llmAuth.model}).`,
          );

          // Try cached brand memory first, fall back to live scrape
          let websiteResult: WebsiteStyleResult | null = null;
          let performanceContext = "";
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
              const emailHash = createHash("sha256")
                .update(session.email.trim().toLowerCase())
                .digest("hex");

              const settings = await readJsonByPath<UserSettings>(
                getUserSettingsPath(session.email),
              );
              const mem = settings?.brandMemory;
              const reqHost = normalizeHostname(request.brand.website || "");
              const memHost = normalizeHostname(mem?.websiteUrl);
              if (mem?.bodyText && memHost && reqHost && memHost === reqHost) {
                websiteResult = { notes: mem.notes || "", bodyText: mem.bodyText };
                startStep(
                  "load-context",
                  "Load website context",
                  "planning",
                  "Pulling cached brand memory for better style alignment.",
                );
                completeStep(
                  "load-context",
                  "Using cached website context from saved brand memory.",
                );
              }

              // Load performance context from past outcomes
              try {
                const outcomeBlobs = await listBlobs(`outcomes/${emailHash}/`, 30);
                // Sort by pathname (timestamp-prefixed) to guarantee chronological order
                outcomeBlobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
                const outcomes: PublishOutcome[] = [];
                for (const blob of outcomeBlobs.slice(-20)) {
                  try {
                    const res = await fetch(blob.url, { cache: "no-store" });
                    if (res.ok) {
                      const parsed = PublishOutcomeSchema.safeParse(await res.json());
                      if (parsed.success) {
                        outcomes.push(parsed.data);
                      }
                    }
                  } catch {
                    // Skip individual outcome errors
                  }
                }
                performanceContext = buildPerformanceContext(outcomes);
              } catch {
                // Performance context is non-critical
              }
            }
          } catch {
            // Fall through to live scrape
          }

          if (!websiteResult) {
            throwIfAborted();
            startStep(
              "load-context",
              "Load website context",
              "planning",
              "Extracting website tone, visual cues, and messaging signals.",
            );
            websiteResult = await buildWebsiteStyleContext(
              request.brand.website,
            );
            throwIfAborted();
            completeStep(
              "load-context",
              websiteResult?.notes || websiteResult?.bodyText
                ? "Website context extracted and attached to the prompt."
                : "No website context found; continuing with brand kit only.",
            );
          }

          startStep(
            "assemble-prompt",
            "Assemble generation prompt",
            "planning",
            "Combining brand, post brief, assets, and prompt controls.",
          );
          completeStep(
            "assemble-prompt",
            "Prompt assembled with campaign constraints and format hints.",
          );

          startStep(
            "draft-variants",
            "Draft candidate variants",
            "execution",
            `Calling ${llmAuth.provider.toUpperCase()} (${llmAuth.model}).`,
          );
          const candidateCount = resolveCandidateCount(llmAuth.model);
          const heartbeatId = setInterval(() => {
            if (generationAbortController.signal.aborted) {
              return;
            }
            send({
              type: "heartbeat",
              detail: `Still waiting on ${llmAuth.provider.toUpperCase()} response...`,
            });
          }, 2500);
          const generated = await generateStructuredJson<unknown>({
            auth: llmAuth,
            systemPrompt: buildGenerationSystemPrompt(request.promptConfig),
            userPrompt: buildGenerationUserPrompt(request, {
              websiteStyleContext: websiteResult?.notes,
              websiteBodyText: websiteResult?.bodyText,
              candidateCount,
              performanceContext: performanceContext || undefined,
            }),
            temperature: resolveGenerationTemperature(llmAuth.model),
            maxTokens: resolveGenerationMaxTokens(llmAuth.model),
            signal: generationAbortController.signal,
          }).finally(() => {
            clearInterval(heartbeatId);
          });
          throwIfAborted();
          completeStep(
            "draft-variants",
            "Model returned candidate concepts and strategy rationale.",
          );

          startStep(
            "select-variants",
            "Validate and select top variants",
            "validation",
            "Applying schema checks and scoring candidates.",
          );
          const { response: internalParsed, recovery } =
            coerceInternalGenerationResponse(generated, request);

          let topVariants: CreativeVariant[];
          try {
            const scores = await scoreVariantsWithLlm(
              llmAuth,
              internalParsed.variants,
              { brandName: request.brand.brandName, voice: request.brand.voice },
              { theme: request.post.theme, audience: request.post.audience, objective: request.post.objective },
            );
            topVariants = selectTopVariantsWithScores(internalParsed.variants, scores, 3);
          } catch {
            topVariants = selectTopVariants(internalParsed.variants, 3);
          }

          const recoveryNotes: string[] = [];
          if (recovery.droppedInvalidVariants > 0) {
            recoveryNotes.push(
              `dropped ${recovery.droppedInvalidVariants} invalid variant(s)`,
            );
          }
          if (recovery.truncatedVariants > 0) {
            recoveryNotes.push(
              `trimmed ${recovery.truncatedVariants} extra variant(s)`,
            );
          }
          if (recovery.usedFallbackVariants > 0) {
            recoveryNotes.push(
              `filled ${recovery.usedFallbackVariants} slot(s) with deterministic fallback`,
            );
          }
          if (recovery.strategyFallbackUsed) {
            recoveryNotes.push("replaced invalid strategy text");
          }

          const parsed = GenerationResponseSchema.parse({
            strategy: internalParsed.strategy,
            variants: topVariants,
          });
          completeStep(
            "select-variants",
            recoveryNotes.length
              ? `Structured output validated with auto-repair (${recoveryNotes.join("; ")}).`
              : "Structured output validated and ranked.",
          );

          startStep(
            "finalize-result",
            "Finalize preview payload",
            "finalization",
            "Preparing variants for rendering in the editor.",
          );
          completeStep("finalize-result", "Preview payload ready.");

          send({
            type: "run-complete",
            result: parsed,
            summary: "Generated 3 concept variants successfully.",
            fallbackUsed: false,
          });
        } catch (generationError) {
          const aborted =
            isAbortError(generationError) || generationAbortController.signal.aborted;
          if (aborted && abortReason === "client") {
            if (activeStepId) {
              failStep(
                activeStepId,
                `${activeStepTitle ?? "Active step"} cancelled by client.`,
              );
            }
            send({
              type: "run-error",
              detail: "Generation cancelled by client.",
            });
            return;
          }

          if (aborted && abortReason === "transport") {
            return;
          }

          if (activeStepId && abortReason === "timeout") {
            failStep(
              activeStepId,
              `${activeStepTitle ?? "Active step"} timed out after ${
                GENERATION_SOFT_TIMEOUT_MS / 1000
              }s without a model response.`,
            );
          } else if (activeStepId) {
            failStep(
              activeStepId,
              `${activeStepTitle ?? "Active step"} failed: ${toErrorMessage(generationError)}`,
            );
          }

          startStep(
            "fallback-response",
            "Build deterministic fallback",
            "finalization",
            abortReason === "timeout"
              ? `Model call timed out after ${
                  GENERATION_SOFT_TIMEOUT_MS / 1000
                }s; recovering with deterministic concepts.`
              : "Recovering with local deterministic concepts.",
          );
          const fallback = createFallbackResponse(request);
          completeStep(
            "fallback-response",
            abortReason === "timeout"
              ? "Fallback concepts prepared after provider timeout."
              : "Fallback concepts prepared successfully.",
          );
          send({
            type: "run-complete",
            result: fallback,
            summary:
              abortReason === "timeout"
                ? "Provider timeout reached; fallback concepts were used."
                : "Model response failed, fallback concepts were used.",
            fallbackUsed: true,
          });
        } finally {
          clearTimeout(timeoutId);
          req.signal.removeEventListener("abort", abortFromRequest);
          closeStream();
        }
      },
      cancel() {
        generationAbortController.abort();
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
