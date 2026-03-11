import { parseCommandOptions } from "../args";
import { IgPosterClient } from "../client";
import type { CliContext } from "../context";
import { CliError } from "../errors";
import { readJsonInput } from "../input";
import {
  printGenerationVariantsTable,
  printJson,
  printStreamJsonEvent,
  printKeyValue,
  printLines,
} from "../output";

type RunOptions = {
  post?: string;
  request?: string;
};

type RefineOptions = {
  post?: string;
  instruction?: string;
  variant?: string;
};

type RefineResponse = {
  source: string;
  variant: Record<string, unknown>;
};

type GenerationVariant = {
  id: string;
  name: string;
  postType: string;
  score?: number;
};

type GenerationResult = {
  strategy: string;
  variants: GenerationVariant[];
};

type GenerationRunEvent =
  | {
      type: "run-start";
      runId: string;
      label: string;
      detail?: string;
    }
  | {
      type: "step-start";
      stepId: string;
      title: string;
      detail?: string;
      phase: string;
    }
  | {
      type: "step-complete";
      stepId: string;
      detail?: string;
    }
  | {
      type: "step-error";
      stepId: string;
      detail: string;
    }
  | {
      type: "heartbeat";
      detail: string;
    }
  | {
      type: "llm-thinking";
      stepId: string;
      text: string;
      detail?: string;
    }
  | {
      type: "run-complete";
      result: GenerationResult;
      summary: string;
      fallbackUsed: boolean;
    }
  | {
      type: "run-error";
      detail: string;
    };

const STEP_PHASES = new Set([
  "queue",
  "planning",
  "execution",
  "validation",
  "finalization",
]);

export const runGenerateCommand = async (ctx: CliContext, argv: string[]) => {
  const action = argv[0];

  switch (action) {
    case "run":
      return runGenerate(ctx, argv.slice(1));
    case "refine":
      return refineGenerate(ctx, argv.slice(1));
    default:
      throw new CliError("Usage: ig generate <run|refine>");
  }
};

const runGenerate = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<RunOptions>(argv, {
    post: "string",
    request: "string",
  });

  if (positionals.length > 0) {
    throw new CliError(
      "Usage: ig generate run [--post <id> | --request @generate.json]",
    );
  }

  const selectedInputs = [options.post, options.request].filter(Boolean).length;
  if (selectedInputs !== 1) {
    throw new CliError(
      "Choose exactly one of --post or --request for `ig generate run`.",
    );
  }

  const body = options.post
    ? { postId: options.post }
    : await readJsonInput<Record<string, unknown>>(options.request as string);

  const client =
    ctx.host
      ? new IgPosterClient({
          host: ctx.host,
          token: ctx.token,
          timeoutMs: Math.max(ctx.globalOptions.timeoutMs ?? 30_000, 120_000),
        })
      : ctx.client;

  const response = await client.requestStream({
    method: "POST",
    path: "/api/v1/generate",
    headers: {
      accept: "text/event-stream",
    },
    body,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = {
      summary: "Generation completed with fallback output.",
      fallbackUsed: true,
      result: parseGenerationResult(await response.json()),
    };
    emitRunEvent(ctx, {
      type: "run-complete",
      ...payload,
    });
    if (ctx.globalOptions.streamJson) {
      printStreamJsonEvent({ type: "done" });
    }
    return printGenerateResult(ctx, payload);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new CliError("No generation response stream was returned.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: {
    summary: string;
    fallbackUsed: boolean;
    result: GenerationResult;
  } | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      return;
    }

    const payload = trimmed.slice("data:".length).trimStart();
    if (!payload) {
      return;
    }

    const event = JSON.parse(payload) as unknown;
    if (!isGenerationRunEvent(event)) {
      return;
    }

    emitRunEvent(ctx, event);

    if (event.type === "run-error") {
      throw new CliError(event.detail);
    }

    if (event.type === "run-complete") {
      finalResult = {
        summary: event.summary,
        fallbackUsed: event.fallbackUsed,
        result: parseGenerationResult(event.result),
      };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const segments = buffer.split("\n");
    buffer = segments.pop() ?? "";
    for (const segment of segments) {
      processLine(segment);
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    processLine(buffer);
  }

  if (!finalResult) {
    throw new CliError("Generation completed without a final result.");
  }

  if (ctx.globalOptions.streamJson) {
    printStreamJsonEvent({ type: "done" });
  }

  return printGenerateResult(ctx, finalResult);
};

const refineGenerate = async (ctx: CliContext, argv: string[]) => {
  const { options, positionals } = parseCommandOptions<RefineOptions>(argv, {
    post: "string",
    instruction: "string",
    variant: "string",
  });

  if (positionals.length > 0 || !options.post || !options.instruction) {
    throw new CliError(
      "Usage: ig generate refine --post <id> --instruction <text> [--variant <id>]",
    );
  }

  const response = await ctx.client.requestJson<RefineResponse>({
    method: "POST",
    path: "/api/v1/generate/refine",
    body: {
      postId: options.post,
      instruction: options.instruction,
      ...(options.variant ? { variantId: options.variant } : {}),
    },
  });

  if (ctx.globalOptions.json) {
    printJson(response, ctx.globalOptions.jq);
    return;
  }

  printKeyValue([
    ["source", response.source],
    ["variantId", String(response.variant.id ?? "")],
    ["variantName", String(response.variant.name ?? "")],
    ["postType", String(response.variant.postType ?? "")],
  ]);
};

const printGenerateResult = (
  ctx: CliContext,
  payload: {
    summary: string;
    fallbackUsed: boolean;
    result: GenerationResult;
  },
) => {
  if (ctx.globalOptions.streamJson) {
    return;
  }

  if (ctx.globalOptions.json) {
    printJson(
      {
        ok: true,
        data: payload,
      },
      ctx.globalOptions.jq,
    );
    return;
  }

  printKeyValue([
    ["summary", payload.summary],
    ["fallbackUsed", String(payload.fallbackUsed)],
    ["variantCount", String(payload.result.variants.length)],
  ]);
  printGenerationVariantsTable(
    payload.result.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      postType: variant.postType,
      score: variant.score,
    })),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const emitRunEvent = (ctx: CliContext, event: GenerationRunEvent) => {
  if (ctx.globalOptions.streamJson) {
    printStreamJsonEvent(event);
    return;
  }

  if (ctx.globalOptions.json || ctx.globalOptions.quiet) {
    return;
  }

  if (event.type === "llm-thinking") {
    return;
  }

  printLines([summarizeRunEvent(event)]);
};

const isGenerationRunEvent = (value: unknown): value is GenerationRunEvent => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "run-start") {
    return (
      typeof value.runId === "string" &&
      typeof value.label === "string" &&
      (value.detail === undefined || typeof value.detail === "string")
    );
  }

  if (value.type === "step-start") {
    return (
      typeof value.stepId === "string" &&
      typeof value.title === "string" &&
      typeof value.phase === "string" &&
      STEP_PHASES.has(value.phase) &&
      (value.detail === undefined || typeof value.detail === "string")
    );
  }

  if (value.type === "step-complete") {
    return (
      typeof value.stepId === "string" &&
      (value.detail === undefined || typeof value.detail === "string")
    );
  }

  if (value.type === "step-error") {
    return typeof value.stepId === "string" && typeof value.detail === "string";
  }

  if (value.type === "heartbeat") {
    return typeof value.detail === "string";
  }

  if (value.type === "llm-thinking") {
    return typeof value.stepId === "string" && typeof value.text === "string";
  }

  if (value.type === "run-complete") {
    return (
      "result" in value &&
      typeof value.summary === "string" &&
      typeof value.fallbackUsed === "boolean"
    );
  }

  return value.type === "run-error" && typeof value.detail === "string";
};

const summarizeRunEvent = (event: GenerationRunEvent) => {
  if (event.type === "run-start") {
    return event.detail || event.label;
  }

  if (event.type === "step-start") {
    return event.detail || `Started: ${event.title}`;
  }

  if (event.type === "step-complete") {
    return event.detail || `Completed step: ${event.stepId}`;
  }

  if (event.type === "step-error") {
    return event.detail;
  }

  if (event.type === "heartbeat") {
    return event.detail;
  }

  if (event.type === "run-complete") {
    return event.summary;
  }

  if (event.type === "llm-thinking") {
    return event.text;
  }

  return event.detail;
};

const parseGenerationResult = (value: unknown): GenerationResult => {
  if (!isRecord(value) || typeof value.strategy !== "string") {
    throw new CliError("Generation stream returned an invalid final result.");
  }

  if (!Array.isArray(value.variants)) {
    throw new CliError("Generation stream returned an invalid variants list.");
  }

  return {
    strategy: value.strategy,
    variants: value.variants.map((variant) => {
      if (
        !isRecord(variant) ||
        typeof variant.id !== "string" ||
        typeof variant.name !== "string" ||
        typeof variant.postType !== "string"
      ) {
        throw new CliError(
          "Generation stream returned an incomplete variant.",
        );
      }

      return {
        id: variant.id,
        name: variant.name,
        postType: variant.postType,
        score: typeof variant.score === "number" ? variant.score : undefined,
      } satisfies GenerationVariant;
    }),
  };
};
