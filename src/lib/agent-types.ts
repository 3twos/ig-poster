import type { GenerationStepPhase, GenerationRunEvent } from "@/lib/generation-events";

export type AgentStepStatus = "pending" | "active" | "completed" | "error" | "cancelled";
export type AgentRunStatus = "idle" | "running" | "success" | "error" | "cancelled";
export type AgentVerbosity = "minimal" | "standard" | "verbose";

export type AgentStep = {
  id: string;
  title: string;
  detail?: string;
  phase: GenerationStepPhase;
  status: AgentStepStatus;
  startedAt?: number;
  endedAt?: number;
  thinkingText?: string;
};

export type AgentPromptSnapshot = {
  title: string;
  systemPrompt: string;
  userPrompt: string;
};

export type AgentRun = {
  id: string;
  label: string;
  detail?: string;
  status: AgentRunStatus;
  startedAt: number;
  endedAt?: number;
  currentStepId?: string;
  heartbeat?: string;
  fallbackUsed?: boolean;
  summary?: string;
  error?: string;
  steps: AgentStep[];
  promptSnapshots: AgentPromptSnapshot[];
  logLines: string[];
};

export const formatElapsed = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;

  if (mins === 0) {
    return `${remSec}s`;
  }

  return `${mins}m ${String(remSec).padStart(2, "0")}s`;
};

export const statusStyle = (status: AgentRunStatus) => {
  if (status === "success") {
    return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "error") {
    return "border-red-300/40 bg-red-400/10 text-red-100";
  }

  if (status === "cancelled") {
    return "border-yellow-300/40 bg-yellow-400/10 text-yellow-100";
  }

  if (status === "running") {
    return "border-blue-300/40 bg-blue-400/10 text-blue-100";
  }

  return "border-white/20 bg-white/5 text-slate-200";
};

export const stepDotStyle = (status: AgentStepStatus) => {
  if (status === "completed") {
    return "bg-emerald-300";
  }

  if (status === "error") {
    return "bg-red-300";
  }

  if (status === "cancelled") {
    return "bg-yellow-300";
  }

  if (status === "active") {
    return "bg-blue-300";
  }

  return "bg-slate-500";
};

export const phaseLabel = (phase: GenerationStepPhase) => {
  if (phase === "queue") return "Queued";
  if (phase === "planning") return "Planning";
  if (phase === "execution") return "Executing";
  if (phase === "validation") return "Validating";
  return "Finalizing";
};

export const phaseNarrative = (phase: GenerationStepPhase, title: string) => {
  if (phase === "queue") return "Waiting to start...";
  if (phase === "planning") return "Reading your brief and studying brand voice...";
  if (phase === "execution") return title;
  if (phase === "validation") return "Reviewing quality and brand alignment...";
  return "Polishing final details...";
};

export const summarizeRunEvent = (event: GenerationRunEvent) => {
  if (event.type === "run-start") {
    return event.detail || event.label;
  }

  if (event.type === "step-start") {
    return event.detail || `Started: ${event.title}`;
  }

  if (event.type === "prompt-preview") {
    return `Prompt ready: ${event.title}`;
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
