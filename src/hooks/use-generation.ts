"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  isGenerationRunEvent,
  type GenerationRunEvent,
} from "@/lib/generation-events";
import {
  type AgentRun,
  type AgentStep,
  type AgentVerbosity,
  formatElapsed,
  summarizeRunEvent,
} from "@/lib/agent-types";
import {
  GenerationResponseSchema,
  type GenerationResponse,
  createDefaultOverlayLayout,
} from "@/lib/creative";
import type { BrandState, LocalAsset, PostState } from "@/lib/types";
import type { PromptConfigState } from "@/lib/types";
import { parseApiError } from "@/lib/upload-helpers";
import { toast } from "sonner";

type UseGenerationOptions = {
  postId: string | null;
  brand: BrandState;
  post: PostState;
  localAssets: LocalAsset[];
  localLogo: LocalAsset | null;
  promptConfig: PromptConfigState;
  dispatch: (action: Record<string, unknown>) => void;
};

type ActiveGenerationRequest = {
  token: string;
  postId: string;
  controller: AbortController;
};

export function useGeneration({
  postId,
  brand,
  post,
  localAssets,
  localLogo,
  promptConfig,
  dispatch,
}: UseGenerationOptions) {
  const [isGeneratingAnyPost, setIsGeneratingAnyPost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runPostId, setRunPostId] = useState<string | null>(null);
  const [agentRunState, setAgentRunState] = useState<AgentRun | null>(null);
  const [agentVerbosity, setAgentVerbosity] = useState<AgentVerbosity>("standard");
  const [showStepDetails, setShowStepDetails] = useState(true);
  const [runClock, setRunClock] = useState(Date.now());
  const [runLogCopyState, setRunLogCopyState] = useState<"idle" | "done">("idle");

  const activeRequestRef = useRef<ActiveGenerationRequest | null>(null);
  const currentPostIdRef = useRef<string | null>(postId);
  const previousPostIdRef = useRef<string | null>(postId);
  currentPostIdRef.current = postId;

  const agentRun = runPostId === postId ? agentRunState : null;
  const isGenerating = isGeneratingAnyPost && runPostId === postId;

  useEffect(() => {
    if (agentRun?.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      setRunClock(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [agentRun?.status]);

  const applyRunEvent = useCallback((event: GenerationRunEvent) => {
    const now = Date.now();
    const stamp = new Date(now).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setAgentRunState((current) => {
      if (event.type === "run-start") {
        return {
          id: event.runId,
          label: event.label,
          detail: event.detail,
          status: "running",
          startedAt: now,
          currentStepId: undefined,
          heartbeat: undefined,
          fallbackUsed: false,
          summary: undefined,
          error: undefined,
          steps: [],
          logLines: [`${stamp} Run started: ${event.label}`],
        };
      }

      if (!current) {
        return current;
      }

      const withLog = (line: string) => [...current.logLines, `${stamp} ${line}`];
      const upsertStep = (
        stepId: string,
        patch: (step: AgentStep) => AgentStep,
        fallback: AgentStep,
      ): AgentStep[] => {
        const existingIndex = current.steps.findIndex((step) => step.id === stepId);
        if (existingIndex === -1) {
          return [...current.steps, fallback];
        }

        return current.steps.map((step, index): AgentStep => {
          if (index !== existingIndex) {
            return step;
          }

          return patch(step);
        });
      };

      if (event.type === "step-start") {
        const steps: AgentStep[] = current.steps.map((step): AgentStep =>
          step.status === "active"
            ? { ...step, status: "completed", endedAt: now }
            : step,
        );
        const existingIndex = steps.findIndex((step) => step.id === event.stepId);
        const nextStep: AgentStep = {
          id: event.stepId,
          title: event.title,
          detail: event.detail,
          phase: event.phase,
          status: "active",
          startedAt: now,
        };

        if (existingIndex === -1) {
          steps.push(nextStep);
        } else {
          steps[existingIndex] = {
            ...steps[existingIndex],
            ...nextStep,
          };
        }

        return {
          ...current,
          status: "running",
          currentStepId: event.stepId,
          heartbeat: undefined,
          steps,
          logLines: withLog(`Start step: ${event.title}`),
        };
      }

      if (event.type === "step-complete") {
        return {
          ...current,
          currentStepId:
            current.currentStepId === event.stepId ? undefined : current.currentStepId,
          heartbeat: undefined,
          steps: upsertStep(
            event.stepId,
            (step) => ({
              ...step,
              status:
                step.status === "cancelled"
                  ? ("cancelled" as const)
                  : ("completed" as const),
              detail: event.detail ?? step.detail,
              endedAt: now,
            }),
            {
              id: event.stepId,
              title: event.stepId,
              detail: event.detail,
              phase: "finalization",
              status: "completed",
              startedAt: now,
              endedAt: now,
            },
          ),
          logLines: withLog(
            `Complete step: ${event.stepId}${event.detail ? ` (${event.detail})` : ""}`,
          ),
        };
      }

      if (event.type === "step-error") {
        return {
          ...current,
          currentStepId:
            current.currentStepId === event.stepId ? undefined : current.currentStepId,
          heartbeat: undefined,
          steps: upsertStep(
            event.stepId,
            (step) => ({
              ...step,
              status: "error",
              detail: event.detail,
              endedAt: now,
            }),
            {
              id: event.stepId,
              title: event.stepId,
              detail: event.detail,
              phase: "execution",
              status: "error",
              startedAt: now,
              endedAt: now,
            },
          ),
          logLines: withLog(`Step failed: ${event.stepId} (${event.detail})`),
        };
      }

      if (event.type === "heartbeat") {
        return {
          ...current,
          heartbeat: event.detail,
          logLines: withLog(`Heartbeat: ${event.detail}`),
        };
      }

      if (event.type === "llm-thinking") {
        return {
          ...current,
          steps: current.steps.map((step): AgentStep => {
            if (step.id !== event.stepId) return step;
            return {
              ...step,
              thinkingText: (step.thinkingText ?? "") + event.text,
            };
          }),
        };
      }

      if (event.type === "run-complete") {
        const steps: AgentStep[] = current.steps.map((step): AgentStep =>
          step.status === "active"
            ? { ...step, status: "completed", endedAt: now }
            : step,
        );

        return {
          ...current,
          status: "success",
          endedAt: now,
          currentStepId: undefined,
          heartbeat: undefined,
          fallbackUsed: event.fallbackUsed,
          summary: event.summary,
          error: undefined,
          steps,
          logLines: withLog(
            `Run complete${event.fallbackUsed ? " (fallback used)" : ""}: ${event.summary}`,
          ),
        };
      }

      if (event.type === "run-error") {
        return {
          ...current,
          status: "error",
          endedAt: now,
          currentStepId: undefined,
          heartbeat: undefined,
          error: event.detail,
          steps: current.steps.map((step) =>
            step.status === "active"
              ? { ...step, status: "error", detail: event.detail, endedAt: now }
              : step,
          ),
          logLines: withLog(`Run error: ${event.detail}`),
        };
      }

      return current;
    });
  }, []);

  const visibleAgentSteps = useMemo(() => {
    if (!agentRun) {
      return [];
    }

    if (agentVerbosity === "verbose") {
      return agentRun.steps;
    }

    if (agentVerbosity === "standard") {
      return agentRun.steps.filter(
        (step) => step.status !== "pending" || step.id === agentRun.currentStepId,
      );
    }

    const prioritized = [
      agentRun.steps.find((step) => step.status === "error"),
      agentRun.steps.find((step) => step.status === "active"),
      [...agentRun.steps].reverse().find((step) => step.status === "completed"),
    ].filter((step): step is AgentStep => Boolean(step));
    const seen = new Set<string>();
    return prioritized.filter((step) => {
      if (seen.has(step.id)) {
        return false;
      }
      seen.add(step.id);
      return true;
    });
  }, [agentRun, agentVerbosity]);

  const completionCounts = useMemo(() => {
    if (!agentRun) {
      return { completed: 0, total: 0 };
    }

    const completed = agentRun.steps.filter(
      (step) => step.status === "completed",
    ).length;
    return {
      completed,
      total: Math.max(agentRun.steps.length, completed),
    };
  }, [agentRun]);

  const runProgress =
    completionCounts.total > 0
      ? Math.round((completionCounts.completed / completionCounts.total) * 100)
      : 0;
  const runDurationMs = agentRun
    ? (agentRun.endedAt ?? runClock) - agentRun.startedAt
    : 0;

  const copyRunLog = useCallback(async () => {
    if (!agentRun) {
      return;
    }

    const runDuration =
      (agentRun.endedAt ?? runClock) - agentRun.startedAt;
    const lines = [
      `Run: ${agentRun.label}`,
      `Status: ${agentRun.status}`,
      `Duration: ${formatElapsed(runDuration)}`,
      `Fallback used: ${agentRun.fallbackUsed ? "yes" : "no"}`,
      "",
      "Steps:",
      ...agentRun.steps.map((step) => {
        const stepDuration =
          typeof step.startedAt === "number"
            ? formatElapsed((step.endedAt ?? runClock) - step.startedAt)
            : "n/a";
        return `- [${step.status}] ${step.title} (${step.phase} · ${stepDuration})${step.detail ? ` - ${step.detail}` : ""}`;
      }),
      "",
      "Log:",
      ...agentRun.logLines,
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setRunLogCopyState("done");
      window.setTimeout(() => setRunLogCopyState("idle"), 1400);
    } catch {
      setRunLogCopyState("idle");
    }
  }, [agentRun, runClock]);

  const cancelGeneration = useCallback(
    (reason: "user" | "post-switch" = "user") => {
      const activeRequest = activeRequestRef.current;
      if (!activeRequest) {
        return;
      }

      activeRequestRef.current = null;
      activeRequest.controller.abort(reason);
      setIsGeneratingAnyPost(false);

      const now = Date.now();
      setAgentRunState((current) => {
        if (!current) {
          return current;
        }

        if (
          current.status === "success" ||
          current.status === "error" ||
          current.status === "cancelled"
        ) {
          return current;
        }

        return {
          ...current,
          status: "cancelled",
          endedAt: now,
          currentStepId: undefined,
          summary:
            reason === "post-switch"
              ? "Generation cancelled when switching posts."
              : "Generation stopped by user.",
          steps: current.steps.map((step) =>
            step.status === "active" || step.status === "pending"
              ? {
                  ...step,
                  status: "cancelled",
                  detail:
                    reason === "post-switch"
                      ? "Cancelled while switching posts."
                      : "Cancelled by user.",
                  endedAt: now,
                }
              : step,
          ),
          logLines: [
            ...current.logLines,
            reason === "post-switch"
              ? "Run cancelled while switching posts."
              : "Run cancelled by user.",
          ],
        };
      });
    },
    [],
  );

  const stopGeneration = useCallback(() => {
    cancelGeneration("user");
  }, [cancelGeneration]);

  const cancelForPostSwitch = useCallback(() => {
    cancelGeneration("post-switch");
  }, [cancelGeneration]);

  useEffect(() => {
    const previousPostId = previousPostIdRef.current;
    previousPostIdRef.current = postId;

    if (
      previousPostId &&
      previousPostId !== postId &&
      activeRequestRef.current?.postId === previousPostId
    ) {
      cancelForPostSwitch();
    }
  }, [cancelForPostSwitch, postId]);

  const generate = useCallback(async () => {
    if (!postId) {
      return;
    }
    setError(null);
    setIsGeneratingAnyPost(true);
    setRunPostId(postId);
    setRunClock(Date.now());

    const requestToken = crypto.randomUUID();
    const abortController = new AbortController();
    activeRequestRef.current = { token: requestToken, postId, controller: abortController };
    let finalResult: GenerationResponse | null = null;
    const isCurrentRequest = () => activeRequestRef.current?.token === requestToken;
    const shouldCommitForCurrentPost = () =>
      isCurrentRequest() && currentPostIdRef.current === postId;
    const applyRunEventIfCurrent = (event: GenerationRunEvent) => {
      if (!isCurrentRequest()) {
        return;
      }

      applyRunEvent(event);
    };

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        signal: abortController.signal,
        body: JSON.stringify({
          brand,
          post,
          assets: localAssets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            mediaType: asset.mediaType,
            durationSec: asset.durationSec,
            width: asset.width,
            height: asset.height,
          })),
          hasLogo: Boolean(localLogo),
          promptConfig,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok && !contentType.includes("text/event-stream")) {
        throw new Error(await parseApiError(response));
      }

      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let seededLegacyStream = false;
        let lastStreamDetail = "";

        const processDataLine = (line: string) => {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith("data:")) {
            return;
          }

          const data = trimmedLine.slice("data:".length).trimStart();
          if (!data) {
            return;
          }

          try {
            const event = JSON.parse(data) as unknown;

            if (isGenerationRunEvent(event)) {
              lastStreamDetail = summarizeRunEvent(event);
              applyRunEventIfCurrent(event);
              if (event.type === "run-complete") {
                finalResult = GenerationResponseSchema.parse(event.result);
              } else if (event.type === "run-error") {
                throw new Error(event.detail);
              }
              return;
            }

            const legacy = event as {
              type?: string;
              message?: string;
              result?: unknown;
            };

            if (legacy.type === "status" && legacy.message) {
              lastStreamDetail = legacy.message;
              if (!seededLegacyStream) {
                applyRunEventIfCurrent({
                  type: "run-start",
                  runId: crypto.randomUUID(),
                  label: "Generate SOTA Concepts",
                  detail: "Streaming generation updates.",
                });
                applyRunEventIfCurrent({
                  type: "step-start",
                  stepId: "legacy-stream",
                  title: "Generate concepts",
                  detail: legacy.message,
                  phase: "execution",
                });
                seededLegacyStream = true;
              } else {
                applyRunEventIfCurrent({
                  type: "heartbeat",
                  detail: legacy.message,
                });
              }
            } else if (legacy.type === "complete" && legacy.result) {
              finalResult = GenerationResponseSchema.parse(legacy.result);
              lastStreamDetail = "Generation stream completed.";
              if (seededLegacyStream) {
                applyRunEventIfCurrent({
                  type: "step-complete",
                  stepId: "legacy-stream",
                  detail: "Generation stream completed.",
                });
              }
              applyRunEventIfCurrent({
                type: "run-complete",
                result: legacy.result,
                summary: "Generated concept variants successfully.",
                fallbackUsed: false,
              });
            } else if (legacy.type === "error" && legacy.message) {
              throw new Error(legacy.message);
            }
          } catch (parseError) {
            if (
              parseError instanceof Error &&
              parseError.message !== "Unexpected end of JSON input"
            ) {
              throw parseError;
            }
          }
        };

        const INACTIVITY_TIMEOUT_MS = 90_000;
        let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
        const resetInactivityTimer = () => {
          clearTimeout(inactivityTimer);
          if (finalResult) return;
          inactivityTimer = setTimeout(() => {
            abortController.abort("inactivity-timeout");
          }, INACTIVITY_TIMEOUT_MS);
        };
        resetInactivityTimer();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resetInactivityTimer();

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              processDataLine(line);
            }
          }
        } finally {
          clearTimeout(inactivityTimer);
        }

        const trailing = `${buffer}${decoder.decode()}`;
        if (trailing.trim()) {
          for (const line of trailing.split("\n")) {
            processDataLine(line);
          }
        }

        if (!finalResult) {
          const suffix = lastStreamDetail
            ? ` Last update: ${lastStreamDetail}`
            : "";
          throw new Error(
            `Generation stream ended before final results were emitted.${suffix}`,
          );
        }
      } else {
        const parsed = GenerationResponseSchema.parse(await response.json());
        applyRunEventIfCurrent({
          type: "run-start",
          runId: crypto.randomUUID(),
          label: "Generate SOTA Concepts",
          detail: "Running non-stream fallback path.",
        });
        applyRunEventIfCurrent({
          type: "step-start",
          stepId: "fallback-json",
          title: "Generate concepts",
          detail: "Received a non-stream response from API.",
          phase: "execution",
        });
        applyRunEventIfCurrent({
          type: "step-complete",
          stepId: "fallback-json",
          detail: "Concept payload received.",
        });
        applyRunEventIfCurrent({
          type: "run-complete",
          result: parsed,
          summary: "Generated concept variants using fallback path.",
          fallbackUsed: true,
        });
        finalResult = parsed;
      }

      const layouts = Object.fromEntries(
        finalResult.variants.map((variant) => [
          variant.id,
          createDefaultOverlayLayout(variant.layout, { cornerRadius: brand.defaultCornerRadius, bgOpacity: brand.defaultBgOpacity }),
        ]),
      );
      if (!shouldCommitForCurrentPost()) {
        return;
      }
      dispatch({
        type: "SET_RESULT",
        postId: postId ?? undefined,
        result: finalResult,
        overlayLayouts: layouts,
      });
      dispatch({
        type: "SET_ACTIVE_VARIANT",
        postId: postId ?? undefined,
        variantId: finalResult.variants[0]?.id ?? "",
      });
    } catch (generationError) {
      if (
        generationError instanceof Error &&
        generationError.name === "AbortError"
      ) {
        if (!isCurrentRequest()) {
          return;
        }
        const isTimeout = abortController.signal.reason === "inactivity-timeout";
        const summary = isTimeout
          ? "Generation timed out — no data received for 90 seconds."
          : "Generation stopped by user.";
        const detail = isTimeout ? "Timed out." : "Cancelled by user.";
        const status = isTimeout ? "error" as const : "cancelled" as const;

        setAgentRunState((current) => {
          if (!current || current.status !== "running") {
            return current;
          }

          const now = Date.now();
          return {
            ...current,
            status,
            endedAt: now,
            currentStepId: undefined,
            summary,
            error: isTimeout ? summary : undefined,
            steps: current.steps.map((step) =>
              step.status === "active"
                ? {
                    ...step,
                    status,
                    detail,
                    endedAt: now,
                  }
                : step,
            ),
            logLines: [...current.logLines, isTimeout ? `Run timed out: ${summary}` : "Run cancelled by user."],
          };
        });
        if (isTimeout) {
          setError(summary);
          toast.error(summary);
        }
        return;
      }

      const message =
        generationError instanceof Error
          ? generationError.message
          : "Unexpected generation issue.";
      if (!isCurrentRequest()) {
        return;
      }
      setAgentRunState((current) => {
        if (!current || current.status !== "running") {
          return current;
        }

        const now = Date.now();
        return {
          ...current,
          status: "error",
          endedAt: now,
          currentStepId: undefined,
          error: message,
          steps: current.steps.map((step) =>
            step.status === "active"
              ? { ...step, status: "error", detail: message, endedAt: now }
              : step,
          ),
          logLines: [...current.logLines, `Run failed: ${message}`],
        };
      });
      setError(message);
      toast.error(message);
    } finally {
      if (isCurrentRequest()) {
        setIsGeneratingAnyPost(false);
        activeRequestRef.current = null;
      }
    }
  }, [brand, dispatch, localAssets, localLogo, post, postId, promptConfig, applyRunEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRequestRef.current?.controller.abort();
    };
  }, []);

  return {
    isGenerating,
    error,
    setError,
    agentRun,
    agentVerbosity,
    setAgentVerbosity,
    showStepDetails,
    setShowStepDetails,
    runClock,
    runLogCopyState,
    visibleAgentSteps,
    completionCounts,
    runProgress,
    runDurationMs,
    generate,
    stopGeneration,
    cancelForPostSwitch,
    copyRunLog,
  };
}
