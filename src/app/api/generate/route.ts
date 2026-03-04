import { NextResponse } from "next/server";

import { z } from "zod";

import {
  GenerationRequestSchema,
  GenerationResponseSchema,
  type GenerationRequest,
  type GenerationResponse,
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  createFallbackResponse,
} from "@/lib/creative";
import { resolveLlmAuthFromRequest } from "@/lib/llm-auth";
import { generateStructuredJson } from "@/lib/llm";
import { buildWebsiteStyleContext } from "@/lib/website-style";

export const runtime = "nodejs";

const GENERATION_STREAM_HEADER = "x-generation-stream";
const GENERATION_STREAM_MODE = "ndjson";
const WEBSITE_STYLE_TIMEOUT_MS = 12_000;
const MODEL_GENERATION_TIMEOUT_MS = 38_000;
const MODEL_HEARTBEAT_INTERVAL_MS = 5_000;

type GenerationStatusLevel = "info" | "warning" | "error";

type GenerationStatusEvent = {
  code: string;
  detail: string;
  level: GenerationStatusLevel;
  at: string;
  elapsedMs: number;
};

type GenerationMeta = {
  requestId: string;
  source: "model" | "fallback";
  sourceReason: "model-success" | "no-llm-auth" | "llm-failure";
  authSource: "connection" | "env" | "none";
  provider: "openai" | "anthropic" | null;
  model: string | null;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  warnings: string[];
  fallbackDetail?: string;
  events: GenerationStatusEvent[];
};

type RunGenerationOptions = {
  req: Request;
  request: GenerationRequest;
  requestId: string;
  onStatus?: (event: GenerationStatusEvent) => void;
};

const wantsStream = (req: Request) =>
  req.headers.get(GENERATION_STREAM_HEADER)?.trim().toLowerCase() ===
  GENERATION_STREAM_MODE;

const toErrorDetail = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

const runGeneration = async (
  options: RunGenerationOptions,
): Promise<{ result: GenerationResponse; meta: GenerationMeta }> => {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const warnings: string[] = [];
  const events: GenerationStatusEvent[] = [];
  const pushStatus = (
    code: string,
    detail: string,
    level: GenerationStatusLevel = "info",
  ) => {
    const event: GenerationStatusEvent = {
      code,
      detail,
      level,
      at: new Date().toISOString(),
      elapsedMs: Date.now() - startedAtMs,
    };
    events.push(event);
    options.onStatus?.(event);
  };

  pushStatus("request.accepted", "Generation request accepted.");
  pushStatus("auth.resolving", "Resolving LLM credentials.");
  const llmAuth = await resolveLlmAuthFromRequest(options.req);

  if (!llmAuth) {
    pushStatus(
      "auth.none",
      "No provider credentials found. Falling back to deterministic local concepts.",
      "warning",
    );
    pushStatus("fallback.generated", "Generated deterministic fallback concepts.");
    const completedAt = new Date().toISOString();
    return {
      result: createFallbackResponse(options.request),
      meta: {
        requestId: options.requestId,
        source: "fallback",
        sourceReason: "no-llm-auth",
        authSource: "none",
        provider: null,
        model: null,
        startedAt,
        completedAt,
        elapsedMs: Date.now() - startedAtMs,
        warnings,
        fallbackDetail:
          "No connected provider key or env fallback credential was available.",
        events,
      },
    };
  }

  pushStatus(
    "auth.ready",
    `Using ${llmAuth.provider.toUpperCase()} model ${llmAuth.model} from ${llmAuth.source}.`,
  );

  let websiteStyleContext: string | null = null;
  if (options.request.brand.website.trim()) {
    pushStatus("website.started", "Extracting website style cues.");
    try {
      websiteStyleContext = await withTimeout(
        buildWebsiteStyleContext(options.request.brand.website),
        WEBSITE_STYLE_TIMEOUT_MS,
        "Website style extraction",
      );
      pushStatus(
        websiteStyleContext ? "website.ready" : "website.skipped",
        websiteStyleContext
          ? "Website style cues extracted."
          : "Website style extraction produced no usable context.",
      );
    } catch (error) {
      const detail = toErrorDetail(error, "Website style extraction failed");
      warnings.push(detail);
      console.warn(
        `[generate:${options.requestId}] Website style extraction failed`,
        detail,
      );
      pushStatus(
        "website.failed",
        `Website style extraction failed: ${detail}`,
        "warning",
      );
    }
  } else {
    pushStatus("website.skipped", "No website provided; skipping style extraction.");
  }

  pushStatus(
    "model.started",
    `Requesting creative direction from ${llmAuth.provider.toUpperCase()} (${llmAuth.model}).`,
  );

  let heartbeatId: ReturnType<typeof setInterval> | null = null;
  const modelStartMs = Date.now();

  try {
    if (options.onStatus) {
      heartbeatId = setInterval(() => {
        const waitSec = Math.max(1, Math.round((Date.now() - modelStartMs) / 1000));
        pushStatus("model.waiting", `Waiting for model response (${waitSec}s).`);
      }, MODEL_HEARTBEAT_INTERVAL_MS);
    }

    const generated = await withTimeout(
      generateStructuredJson<unknown>({
        auth: llmAuth,
        systemPrompt: buildGenerationSystemPrompt(options.request.promptConfig),
        userPrompt: buildGenerationUserPrompt(options.request, {
          websiteStyleContext: websiteStyleContext ?? undefined,
        }),
        temperature: 0.9,
        maxTokens: 8192,
      }),
      MODEL_GENERATION_TIMEOUT_MS,
      "Model generation",
    );

    pushStatus("model.completed", "Model response received.");
    const parsed = GenerationResponseSchema.parse(generated);
    pushStatus("response.validated", "Response schema validated.");
    const completedAt = new Date().toISOString();

    return {
      result: parsed,
      meta: {
        requestId: options.requestId,
        source: "model",
        sourceReason: "model-success",
        authSource: llmAuth.source,
        provider: llmAuth.provider,
        model: llmAuth.model,
        startedAt,
        completedAt,
        elapsedMs: Date.now() - startedAtMs,
        warnings,
        events,
      },
    };
  } catch (error) {
    const detail = toErrorDetail(error, "Model generation failed");
    warnings.push(detail);
    console.error(`[generate:${options.requestId}] Model generation failed`, detail);
    pushStatus("model.failed", `Model generation failed: ${detail}`, "error");
    pushStatus("fallback.generated", "Generated deterministic fallback concepts.", "warning");
    const completedAt = new Date().toISOString();

    return {
      result: createFallbackResponse(options.request),
      meta: {
        requestId: options.requestId,
        source: "fallback",
        sourceReason: "llm-failure",
        authSource: llmAuth.source,
        provider: llmAuth.provider,
        model: llmAuth.model,
        startedAt,
        completedAt,
        elapsedMs: Date.now() - startedAtMs,
        warnings,
        fallbackDetail: detail,
        events,
      },
    };
  } finally {
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
    }
  }
};

const streamGeneration = async (req: Request, request: GenerationRequest) => {
  const encoder = new TextEncoder();
  const requestId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      void (async () => {
        try {
          const { result, meta } = await runGeneration({
            req,
            request,
            requestId,
            onStatus: (status) => {
              write({
                type: "status",
                status,
                requestId,
              });
            },
          });

          write({
            type: "result",
            result,
            meta,
          });
        } catch (error) {
          write({
            type: "error",
            requestId,
            error: toErrorDetail(error, "Could not generate creative direction"),
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
};

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const request = GenerationRequestSchema.parse(json);

    if (wantsStream(req)) {
      return streamGeneration(req, request);
    }

    const requestId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const { result, meta } = await runGeneration({
      req,
      request,
      requestId,
    });

    return NextResponse.json({
      ...result,
      _meta: meta,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      {
        error: "Could not generate creative direction",
        detail:
          error instanceof z.ZodError
            ? "Request body failed validation."
            : toErrorDetail(error, "Unexpected generation failure"),
      },
      { status },
    );
  }
}
