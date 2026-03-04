"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentRun, AgentStep, AgentVerbosity } from "@/lib/agent-types";
import {
  formatElapsed,
  statusStyle,
  stepDotStyle,
  phaseLabel,
  phaseNarrative,
} from "@/lib/agent-types";
import { cn } from "@/lib/utils";

type Props = {
  agentRun: AgentRun | null;
  agentVerbosity: AgentVerbosity;
  setAgentVerbosity: (v: AgentVerbosity) => void;
  showStepDetails: boolean;
  setShowStepDetails: (v: boolean) => void;
  visibleAgentSteps: AgentStep[];
  runProgress: number;
  runDurationMs: number;
  runClock: number;
  runLogCopyState: "idle" | "done";
  onCopyRunLog: () => void;
};

export function AgentActivityPanel({
  agentRun,
  agentVerbosity,
  setAgentVerbosity,
  showStepDetails,
  setShowStepDetails,
  visibleAgentSteps,
  runProgress,
  runDurationMs,
  runClock,
  runLogCopyState,
  onCopyRunLog,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-blue-100 uppercase">
            Agent Activity
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Reasoning steps, planning phases, and execution status.
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase",
            statusStyle(agentRun?.status ?? "idle"),
          )}
        >
          {agentRun?.status ?? "idle"}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-200">
          <Label className="text-[11px] text-slate-200">Verbosity</Label>
          <Select
            value={agentVerbosity}
            onValueChange={(value) => setAgentVerbosity(value as AgentVerbosity)}
          >
            <SelectTrigger size="sm" className="h-6 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="verbose">Verbose</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => setShowStepDetails(!showStepDetails)}
          disabled={!agentRun?.steps.length}
        >
          {showStepDetails ? "Collapse Steps" : "Expand Steps"}
        </Button>

        <Button
          variant="outline"
          size="xs"
          onClick={onCopyRunLog}
          disabled={!agentRun}
        >
          {runLogCopyState === "done" ? "Copied" : "Copy Diagnostics"}
        </Button>
      </div>

      {agentRun ? (
        <>
          <div className="rounded-xl border border-white/15 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-100">
                {agentRun.label}
              </p>
              <div className="text-right">
                <p className="text-[11px] text-slate-300">
                  {formatElapsed(runDurationMs)}
                </p>
                <p className="font-mono text-[10px] text-slate-500">
                  run:{agentRun.id.slice(0, 8)}
                </p>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              {agentRun.summary ??
                agentRun.detail ??
                "Tracking planning and execution phases."}
              {agentRun.fallbackUsed ? " Fallback path used." : ""}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-blue-300 transition-all duration-300"
                style={{ width: `${Math.min(100, runProgress)}%` }}
              />
            </div>
            <div
              role="progressbar"
              aria-label="Generation progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={runProgress}
              className="sr-only"
            >
              {runProgress}%
            </div>
          </div>

          {showStepDetails ? (
            <div className="space-y-2">
              {visibleAgentSteps.length ? (
                visibleAgentSteps.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    runClock={runClock}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-xs text-slate-300">
                  Step list is empty for this run.
                </p>
              )}
            </div>
          ) : null}

          {agentVerbosity === "verbose" && showStepDetails ? (
            <div className="rounded-xl border border-white/15 bg-black/30 p-3">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
                Detailed Log
              </p>
              <div className="mt-2 max-h-36 space-y-1 overflow-auto pr-1">
                {agentRun.logLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="text-[11px] text-slate-300">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-xs text-slate-300">
          No active run yet. Start generation to see planning and execution steps.
        </p>
      )}
    </div>
  );
}

function StepCard({ step, runClock }: { step: AgentStep; runClock: number }) {
  const [showThinking, setShowThinking] = useState(false);
  const thinkingRef = useRef<HTMLPreElement>(null);

  // Auto-scroll thinking text to bottom
  useEffect(() => {
    if (showThinking && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [showThinking, step.thinkingText]);

  const stepDuration =
    typeof step.startedAt === "number"
      ? formatElapsed((step.endedAt ?? runClock) - step.startedAt)
      : "n/a";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white/5 p-2.5 transition-all duration-300",
        step.status === "active"
          ? "border-blue-300/35 bg-blue-400/5"
          : step.status === "error"
            ? "border-red-300/35"
            : step.status === "completed"
              ? "border-emerald-300/20"
              : "border-white/15",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-100">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              step.status === "active" && "animate-pulse",
              stepDotStyle(step.status),
            )}
          />
          {step.status === "active"
            ? phaseNarrative(step.phase, step.title)
            : step.title}
        </p>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {phaseLabel(step.phase)} · {stepDuration}
        </Badge>
      </div>
      {step.detail ? (
        <p className="mt-1 pl-4 text-[11px] text-slate-400">
          {step.detail}
        </p>
      ) : null}

      {/* Thinking text stream */}
      {step.thinkingText ? (
        <div className="mt-2 pl-4">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-300 hover:text-blue-200"
          >
            {showThinking ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {showThinking ? "Hide reasoning" : "Show reasoning"}
          </button>
          {showThinking ? (
            <pre
              ref={thinkingRef}
              className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-slate-300"
            >
              {step.thinkingText}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
