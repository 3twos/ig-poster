export type GenerationStepPhase =
  | "queue"
  | "planning"
  | "execution"
  | "validation"
  | "finalization";

export type GenerationRunEvent =
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
      phase: GenerationStepPhase;
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
      result: unknown;
      summary: string;
      fallbackUsed: boolean;
    }
  | {
      type: "run-error";
      detail: string;
    };

export const toSseEvent = (event: GenerationRunEvent) =>
  `data: ${JSON.stringify(event)}\n\n`;

const EVENT_TYPES = new Set<GenerationRunEvent["type"]>([
  "run-start",
  "step-start",
  "step-complete",
  "step-error",
  "heartbeat",
  "llm-thinking",
  "run-complete",
  "run-error",
]);

const STEP_PHASES = new Set<GenerationStepPhase>([
  "queue",
  "planning",
  "execution",
  "validation",
  "finalization",
]);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

export const isGenerationRunEvent = (value: unknown): value is GenerationRunEvent => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const type = value.type;
  if (
    typeof type !== "string" ||
    !EVENT_TYPES.has(type as GenerationRunEvent["type"])
  ) {
    return false;
  }

  if (type === "run-start") {
    return (
      typeof value.runId === "string" &&
      typeof value.label === "string" &&
      (value.detail === undefined || typeof value.detail === "string")
    );
  }

  if (type === "step-start") {
    return (
      typeof value.stepId === "string" &&
      typeof value.title === "string" &&
      typeof value.phase === "string" &&
      STEP_PHASES.has(value.phase as GenerationStepPhase) &&
      (value.detail === undefined || typeof value.detail === "string")
    );
  }

  if (type === "step-complete") {
    return (
      typeof value.stepId === "string" &&
      (value.detail === undefined || typeof value.detail === "string")
    );
  }

  if (type === "step-error") {
    return typeof value.stepId === "string" && typeof value.detail === "string";
  }

  if (type === "heartbeat") {
    return typeof value.detail === "string";
  }

  if (type === "llm-thinking") {
    return typeof value.stepId === "string" && typeof value.text === "string";
  }

  if (type === "run-complete") {
    return (
      "result" in value &&
      typeof value.summary === "string" &&
      typeof value.fallbackUsed === "boolean"
    );
  }

  return type === "run-error" && typeof value.detail === "string";
};
