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
import { resolveAllLlmAuthFromRequest } from "@/lib/llm-auth";
import { streamStructuredJsonWithCallback, type ResolvedLlmAuth } from "@/lib/llm";
import {
  getUserSettingsPath,
  type UserSettings,
} from "@/lib/user-settings";
import { hashEmail, isAbortError, toErrorMessage } from "@/lib/server-utils";
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
    const authList = await resolveAllLlmAuthFromRequest(req);

    if (authList.connections.length === 0) {
      return NextResponse.json(createFallbackResponse(request));
    }

  const generationAbortController = new AbortController();
  let abortReason: "client" | "timeout" | "transport" | null = null;
  const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;
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
          if (
            streamClosed ||
            (generationAbortController.signal.aborted && abortReason !== "timeout")
          ) {
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

          const modelSummary = authList.connections
            .map((c) => `${c.provider.toUpperCase()} (${c.model})`)
            .join(", ");

          send({
            type: "run-start",
            runId,
            label: "Generate SOTA Concepts",
            detail: `Planning and drafting post concepts. Mode: ${authList.mode}.`,
          });

          startStep(
            "resolve-provider",
            "Resolve model provider",
            "planning",
            "Authenticating model connection and runtime credentials.",
          );
          completeStep(
            "resolve-provider",
            `Connected to ${modelSummary}. Mode: ${authList.mode}.`,
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
              const emailHash = hashEmail(session.email);

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
                outcomeBlobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
                const results = await Promise.allSettled(
                  outcomeBlobs.slice(-20).map(async (blob) => {
                    const res = await fetch(blob.url, { cache: "no-store" });
                    if (!res.ok) return null;
                    const parsed = PublishOutcomeSchema.safeParse(await res.json());
                    return parsed.success ? parsed.data : null;
                  }),
                );
                const outcomes = results
                  .filter(
                    (r): r is PromiseFulfilledResult<PublishOutcome> =>
                      r.status === "fulfilled" && r.value != null,
                  )
                  .map((r) => r.value);
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

          // ---------------------------------------------------------------
          // Draft variants: fallback or parallel mode
          // ---------------------------------------------------------------

          let allVariants: CreativeVariant[] = [];
          let strategyText = "";
          let scoringAuth: ResolvedLlmAuth = authList.connections[0];
          let generationSucceeded = false;
          const promptPreviewKeys = new Set<string>();

          const buildLlmOptions = (auth: ResolvedLlmAuth, candidateCount: number) => {
            const systemPrompt = buildGenerationSystemPrompt(request.promptConfig);
            const userPrompt = buildGenerationUserPrompt(request, {
              websiteStyleContext: websiteResult?.notes,
              websiteBodyText: websiteResult?.bodyText,
              candidateCount,
              performanceContext: performanceContext || undefined,
            });
            const previewKey = `${auth.provider}:${auth.model}:${candidateCount}`;

            if (!promptPreviewKeys.has(previewKey)) {
              promptPreviewKeys.add(previewKey);
              send({
                type: "prompt-preview",
                title: `Generation prompt (${auth.provider.toUpperCase()} ${auth.model})`,
                systemPrompt,
                userPrompt,
              });
            }

            return {
              auth,
              systemPrompt,
              userPrompt,
              temperature: resolveGenerationTemperature(auth.model),
              maxTokens: resolveGenerationMaxTokens(auth.model),
              signal: generationAbortController.signal,
              onChunk: (text: string) => {
                send({ type: "llm-thinking", stepId: "draft-variants", text });
              },
            };
          };

          if (authList.mode === "parallel" && authList.connections.length > 1) {
            // ---------- Parallel mode ----------
            startStep(
              "draft-variants",
              "Draft candidate variants (parallel)",
              "execution",
              `Querying ${authList.connections.length} models simultaneously.`,
            );

            const results = await Promise.allSettled(
              authList.connections.map(async (auth) => {
                const perModelCount = Math.ceil(
                  resolveCandidateCount(auth.model) * 1.2 / authList.connections.length,
                );
                const generated = await streamStructuredJsonWithCallback<unknown>(
                  buildLlmOptions(auth, Math.max(3, perModelCount)),
                );
                return { auth, generated };
              }),
            );

            const succeededResults: Array<{ auth: ResolvedLlmAuth; generated: unknown }> = [];
            for (const result of results) {
              if (result.status === "fulfilled") {
                succeededResults.push(result.value);
              }
            }

            if (succeededResults.length > 0) {
              generationSucceeded = true;
              scoringAuth = succeededResults[0].auth;

              for (const { generated } of succeededResults) {
                try {
                  const { response: parsed } = coerceInternalGenerationResponse(
                    generated,
                    request,
                  );
                  allVariants.push(...parsed.variants);
                  if (!strategyText && parsed.strategy) {
                    strategyText = parsed.strategy;
                  }
                } catch {
                  // Skip invalid responses
                }
              }

              const failedCount = results.length - succeededResults.length;
              completeStep(
                "draft-variants",
                `Received ${allVariants.length} candidates from ${succeededResults.length} model(s)` +
                  (failedCount > 0 ? ` (${failedCount} model(s) failed).` : "."),
              );
            } else {
              throwIfAborted();
              failStep(
                "draft-variants",
                "All models failed in parallel mode.",
              );
            }
          } else {
            // ---------- Fallback mode ----------
            for (let i = 0; i < authList.connections.length; i++) {
              const auth = authList.connections[i];
              throwIfAborted();

              const stepId = i === 0 ? "draft-variants" : `draft-variants-fallback-${i}`;
              startStep(
                stepId,
                i === 0 ? "Draft candidate variants" : `Fallback to ${auth.provider.toUpperCase()} (${auth.model})`,
                "execution",
                `Calling ${auth.provider.toUpperCase()} (${auth.model}).`,
              );

              try {
                const candidateCount = resolveCandidateCount(auth.model);
                const generated = await streamStructuredJsonWithCallback<unknown>({
                  ...buildLlmOptions(auth, candidateCount),
                  onChunk: (text) => {
                    send({ type: "llm-thinking", stepId, text });
                  },
                });
                throwIfAborted();

                const { response: parsed, recovery } = coerceInternalGenerationResponse(
                  generated,
                  request,
                );
                allVariants = parsed.variants;
                strategyText = parsed.strategy;
                scoringAuth = auth;
                generationSucceeded = true;

                const recoveryNotes: string[] = [];
                if (recovery.droppedInvalidVariants > 0) {
                  recoveryNotes.push(`dropped ${recovery.droppedInvalidVariants} invalid`);
                }
                if (recovery.usedFallbackVariants > 0) {
                  recoveryNotes.push(`filled ${recovery.usedFallbackVariants} fallback`);
                }

                completeStep(
                  stepId,
                  `${auth.provider.toUpperCase()} (${auth.model}) returned ${allVariants.length} candidates` +
                    (recoveryNotes.length ? ` (${recoveryNotes.join(", ")}).` : "."),
                );
                break; // Success — exit fallback loop
              } catch (modelError) {
                if (isAbortError(modelError) || generationAbortController.signal.aborted) {
                  throw modelError; // Re-throw abort errors
                }
                failStep(
                  stepId,
                  `${auth.provider.toUpperCase()} (${auth.model}) failed: ${toErrorMessage(modelError)}`,
                );
                // Continue to next model
              }
            }
          }

          if (!generationSucceeded || allVariants.length === 0) {
            throw new Error("All models failed to generate variants.");
          }

          // ---------------------------------------------------------------
          // Score and select top variants
          // ---------------------------------------------------------------

          startStep(
            "select-variants",
            "Validate and select top variants",
            "validation",
            "Applying schema checks and scoring candidates.",
          );

          let topVariants: CreativeVariant[];
          try {
            const scores = await scoreVariantsWithLlm(
              scoringAuth,
              allVariants,
              {
                brandName: request.brand.brandName,
                voice: request.brand.voice,
                values: request.brand.values,
                principles: request.brand.principles,
              },
              {
                theme: request.post.theme,
                subject: request.post.subject,
                thought: request.post.thought,
                audience: request.post.audience,
                objective: request.post.objective,
                mood: request.post.mood,
              },
              request.promptConfig?.customInstructions,
              generationAbortController.signal,
            );
            topVariants = selectTopVariantsWithScores(allVariants, scores, 3, {
              brand: {
                brandName: request.brand.brandName,
                voice: request.brand.voice,
                values: request.brand.values,
                principles: request.brand.principles,
              },
              post: request.post,
            });
          } catch {
            topVariants = selectTopVariants(allVariants, 3, {
              brand: {
                brandName: request.brand.brandName,
                voice: request.brand.voice,
                values: request.brand.values,
                principles: request.brand.principles,
              },
              post: request.post,
            });
          }

          const parsed = GenerationResponseSchema.parse({
            strategy: strategyText,
            variants: topVariants,
          });
          completeStep(
            "select-variants",
            `Selected top 3 from ${allVariants.length} candidates.`,
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
          if (aborted && (abortReason === "client" || abortReason === null)) {
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
              }s before generation completed.`,
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
              ? `Generation timed out after ${
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
        if (!generationAbortController.signal.aborted) {
          abortReason = "client";
          generationAbortController.abort();
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
