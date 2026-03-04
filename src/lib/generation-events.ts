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
  "run-complete",
  "run-error",
]);

export const isGenerationRunEvent = (value: unknown): value is GenerationRunEvent => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && EVENT_TYPES.has(type as GenerationRunEvent["type"]);
};
