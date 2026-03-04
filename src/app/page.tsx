"use client";

import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import {
  Copy,
  Download,
  Film,
  ImagePlus,
  Images,
  LayoutTemplate,
  Link2,
  LoaderCircle,
  RefreshCw,
  Send,
  Square,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { AppShell } from "@/components/app-shell";
import { PosterPreview } from "@/components/poster-preview";
import {
  type AspectRatio,
  createDefaultOverlayLayout,
  type CreativeVariant,
  GenerationResponseSchema,
  type GenerationResponse,
  type OverlayLayout,
} from "@/lib/creative";
import {
  type BrandState,
  type InstagramAuthStatus,
  type LlmAuthStatus,
  type LocalAsset,
  type PostState,
  type PromptConfigState,
  INITIAL_BRAND,
  INITIAL_POST,
  RATIO_OPTIONS,
} from "@/lib/types";
import {
  extractVideoMetadata,
  formatDuration,
  mediaTypeFromFile,
  parseApiError,
  statusChip,
} from "@/lib/upload-helpers";
import {
  isGenerationRunEvent,
  type GenerationRunEvent,
  type GenerationStepPhase,
} from "@/lib/generation-events";
import { cn, slugify } from "@/lib/utils";

type AgentStepStatus = "pending" | "active" | "completed" | "error" | "cancelled";
type AgentRunStatus = "idle" | "running" | "success" | "error" | "cancelled";
type AgentVerbosity = "minimal" | "standard" | "verbose";

type AgentStep = {
  id: string;
  title: string;
  detail?: string;
  phase: GenerationStepPhase;
  status: AgentStepStatus;
  startedAt?: number;
  endedAt?: number;
};

type AgentRun = {
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
  logLines: string[];
};

const formatElapsed = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;

  if (mins === 0) {
    return `${remSec}s`;
  }

  return `${mins}m ${String(remSec).padStart(2, "0")}s`;
};

const statusStyle = (status: AgentRunStatus) => {
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

const stepDotStyle = (status: AgentStepStatus) => {
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

const phaseLabel = (phase: GenerationStepPhase) => {
  if (phase === "queue") {
    return "Queued";
  }

  if (phase === "planning") {
    return "Planning";
  }

  if (phase === "execution") {
    return "Executing";
  }

  if (phase === "validation") {
    return "Validating";
  }

  return "Finalizing";
};

export default function Home() {
  const [brand, setBrand] = useState<BrandState>(INITIAL_BRAND);
  const [post, setPost] = useState<PostState>(INITIAL_POST);
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [logo, setLogo] = useState<LocalAsset | null>(null);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [overlayLayouts, setOverlayLayouts] = useState<
    Record<string, OverlayLayout>
  >({});
  const [editorMode, setEditorMode] = useState(false);
  const [promptConfig, setPromptConfig] = useState<PromptConfigState>({
    systemPrompt: "",
    customInstructions: "",
  });

  const [isUploadingAssets, setIsUploadingAssets] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const [shareCopyState, setShareCopyState] = useState<"idle" | "done">(
    "idle",
  );
  const [scheduleAt, setScheduleAt] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [authStatus, setAuthStatus] = useState<InstagramAuthStatus>({
    connected: false,
    source: null,
  });
  const [llmAuthStatus, setLlmAuthStatus] = useState<LlmAuthStatus>({
    connected: false,
    source: null,
  });
  const [hasBrand, setHasBrand] = useState<boolean | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentVerbosity, setAgentVerbosity] = useState<AgentVerbosity>("standard");
  const [showStepDetails, setShowStepDetails] = useState(true);
  const [runClock, setRunClock] = useState(Date.now());
  const [runLogCopyState, setRunLogCopyState] = useState<"idle" | "done">("idle");

  const posterRef = useRef<HTMLDivElement>(null);
  const activityPanelRef = useRef<HTMLDivElement>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const assetCleanupRef = useRef<LocalAsset[]>([]);
  const logoCleanupRef = useRef<LocalAsset | null>(null);

  useEffect(() => {
    assetCleanupRef.current = assets;
  }, [assets]);

  useEffect(() => {
    logoCleanupRef.current = logo;
  }, [logo]);

  useEffect(() => {
    return () => {
      assetCleanupRef.current.forEach((asset) =>
        URL.revokeObjectURL(asset.previewUrl),
      );
      if (logoCleanupRef.current) {
        URL.revokeObjectURL(logoCleanupRef.current.previewUrl);
      }
      generationAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (agentRun?.status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      setRunClock(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [agentRun?.status]);

  // Load brand + promptConfig from settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) {
          // 401/503 = auth or config issue, not "no brand"
          setHasBrand(null);
          return;
        }

        const json = await response.json();
        if (json?.brand?.brandName) {
          setBrand((current) => ({ ...current, ...json.brand }));
          setHasBrand(true);
        } else {
          setHasBrand(false);
        }
        if (json?.promptConfig) {
          setPromptConfig((current) => ({ ...current, ...json.promptConfig }));
        }
        if (json?.logoUrl) {
          setLogo({
            id: "saved-logo",
            name: "Saved logo",
            mediaType: "image",
            previewUrl: json.logoUrl,
            storageUrl: json.logoUrl,
            status: "uploaded",
          });
        }
      } catch {
        // Network/parse error — don't show misleading banner
        setHasBrand(null);
      }
    };

    void loadSettings();
  }, []);

  const loadAuthStatus = useCallback(async () => {
    setIsAuthLoading(true);
    try {
      const response = await fetch("/api/auth/meta/status", {
        cache: "no-store",
      });
      const json = (await response.json()) as InstagramAuthStatus;
      setAuthStatus({
        connected: Boolean(json.connected),
        source: json.source ?? null,
        account: json.account,
        detail: json.detail,
      });
    } catch {
      setAuthStatus({
        connected: false,
        source: null,
        detail: "Could not load Instagram auth status.",
      });
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const loadLlmStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/llm/status", {
        cache: "no-store",
      });
      const json = (await response.json()) as LlmAuthStatus;
      setLlmAuthStatus({
        connected: Boolean(json.connected),
        source: json.source ?? null,
        provider: json.provider,
        model: json.model,
        detail: json.detail,
      });
    } catch {
      setLlmAuthStatus({
        connected: false,
        source: null,
        detail: "Could not load LLM provider status.",
      });
    }
  }, []);

  useEffect(() => {
    void loadAuthStatus();
    void loadLlmStatus();

    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    const detail = params.get("detail");

    if (auth === "connected") {
      setPublishMessage("Instagram account connected.");
    }

    if (auth === "error" && detail) {
      const safeDetail = detail.slice(0, 200).replace(/[<>"']/g, "");
      setError(safeDetail);
    }

    if (auth) {
      params.delete("auth");
      params.delete("detail");
      const next = params.toString();
      window.history.replaceState(
        {},
        "",
        next
          ? `${window.location.pathname}?${next}`
          : window.location.pathname,
      );
    }
  }, [loadAuthStatus, loadLlmStatus]);

  const activeVariant = useMemo(() => {
    if (!result?.variants.length) {
      return null;
    }

    return (
      result.variants.find((variant) => variant.id === activeVariantId) ??
      result.variants[0]
    );
  }, [activeVariantId, result]);

  // Reset slide index when variant changes
  useEffect(() => {
    setActiveSlideIndex(0);
  }, [activeVariantId]);

  const activeOverlayLayout = useMemo(() => {
    if (!activeVariant) {
      return undefined;
    }

    return (
      overlayLayouts[activeVariant.id] ??
      createDefaultOverlayLayout(activeVariant.layout)
    );
  }, [activeVariant, overlayLayouts]);

  const assetMap = useMemo(() => {
    return new Map(assets.map((asset) => [asset.id, asset]));
  }, [assets]);

  const orderedVariantAssets = useMemo(() => {
    if (!activeVariant) {
      return assets;
    }

    const ordered = activeVariant.assetSequence
      .map((assetId) => assetMap.get(assetId))
      .filter((asset): asset is LocalAsset => Boolean(asset));

    if (!ordered.length) {
      return assets;
    }

    const used = new Set(ordered.map((asset) => asset.id));
    const rest = assets.filter((asset) => !used.has(asset.id));
    return [...ordered, ...rest];
  }, [activeVariant, assetMap, assets]);

  const getDisplayVisual = (asset?: LocalAsset) => {
    if (!asset) {
      return undefined;
    }

    if (asset.mediaType === "video") {
      return asset.posterUrl || undefined;
    }

    return asset.previewUrl;
  };

  // For carousel, show asset based on activeSlideIndex
  const primaryVisualIndex =
    activeVariant?.postType === "carousel" ? activeSlideIndex : 0;
  const primaryVisual = getDisplayVisual(
    orderedVariantAssets[primaryVisualIndex],
  );
  const secondaryVisual = getDisplayVisual(orderedVariantAssets[1]);

  const applyRunEvent = useCallback((event: GenerationRunEvent) => {
    const now = Date.now();
    const stamp = new Date(now).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    setAgentRun((current) => {
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

  const isAgentBusy =
    isGenerating || isUploadingAssets || isUploadingLogo || isSharing || isPublishing || isRefining;

  const statusLine = useMemo(() => {
    if (agentRun?.status === "running") {
      const activeStep =
        agentRun.steps.find((step) => step.status === "active") ??
        agentRun.steps[agentRun.steps.length - 1];
      const activeIndex = activeStep
        ? agentRun.steps.findIndex((step) => step.id === activeStep.id) + 1
        : 1;

      return {
        tone: "active" as const,
        text: `${activeStep?.title ?? "Generating concepts"} · Step ${Math.max(activeIndex, 1)}/${Math.max(agentRun.steps.length, 1)}${agentRun.heartbeat ? ` · ${agentRun.heartbeat}` : ""}`,
        elapsedMs: runClock - agentRun.startedAt,
        showStop: true,
      };
    }

    if (isGenerating) {
      return {
        tone: "active" as const,
        text: "Preparing generation request...",
        elapsedMs: undefined,
        showStop: true,
      };
    }

    if (isUploadingAssets || isUploadingLogo) {
      return {
        tone: "active" as const,
        text: "Uploading assets to persistent storage...",
        elapsedMs: undefined,
        showStop: false,
      };
    }

    if (isSharing) {
      return {
        tone: "active" as const,
        text: "Creating share link and syncing rendered preview...",
        elapsedMs: undefined,
        showStop: false,
      };
    }

    if (isPublishing) {
      return {
        tone: "active" as const,
        text: "Publishing to Instagram...",
        elapsedMs: undefined,
        showStop: false,
      };
    }

    if (isRefining) {
      return {
        tone: "active" as const,
        text: "Refining selected variant...",
        elapsedMs: undefined,
        showStop: false,
      };
    }

    if (error) {
      return {
        tone: "error" as const,
        text: error,
        elapsedMs: undefined,
        showStop: false,
      };
    }

    if (agentRun?.status === "success") {
      return {
        tone: "success" as const,
        text:
          agentRun.summary ??
          (agentRun.fallbackUsed
            ? "Concept generation complete with fallback."
            : "Concept generation complete."),
        elapsedMs:
          typeof agentRun.endedAt === "number"
            ? agentRun.endedAt - agentRun.startedAt
            : undefined,
        showStop: false,
      };
    }

    if (agentRun?.status === "cancelled") {
      return {
        tone: "error" as const,
        text: agentRun.summary ?? "Generation stopped.",
        elapsedMs:
          typeof agentRun.endedAt === "number"
            ? agentRun.endedAt - agentRun.startedAt
            : undefined,
        showStop: false,
      };
    }

    if (publishMessage) {
      return {
        tone: "success" as const,
        text: publishMessage,
        elapsedMs: undefined,
        showStop: false,
      };
    }

    if (shareUrl) {
      return {
        tone: "success" as const,
        text: "Share link created and copied to clipboard.",
        elapsedMs: undefined,
        showStop: false,
      };
    }

    return {
      tone: "idle" as const,
      text: "Ready. Upload assets and generate concepts.",
      elapsedMs: undefined,
      showStop: false,
    };
  }, [
    agentRun,
    error,
    isGenerating,
    isPublishing,
    isRefining,
    isSharing,
    isUploadingAssets,
    isUploadingLogo,
    publishMessage,
    runClock,
    shareUrl,
  ]);

  const canRetryGeneration =
    !isGenerating && assets.length > 0 && !isUploadingAssets && !isUploadingLogo;

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
        return `- [${step.status}] ${step.title} (${phaseLabel(step.phase)} · ${stepDuration})${step.detail ? ` - ${step.detail}` : ""}`;
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

  const stopGeneration = useCallback(() => {
    const activeController = generationAbortRef.current;
    if (!activeController) {
      return;
    }

    generationAbortRef.current = null;
    activeController.abort();

    const now = Date.now();
    setAgentRun((current) => {
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
        summary: "Generation stopped by user.",
        steps: current.steps.map((step) =>
          step.status === "active" || step.status === "pending"
            ? {
                ...step,
                status: "cancelled",
                detail: "Cancelled by user.",
                endedAt: now,
              }
            : step,
        ),
        logLines: [...current.logLines, "Run cancelled by user."],
      };
    });
  }, []);

  const uploadFileToStorage = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    const response = await fetch("/api/assets/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    const json = (await response.json()) as { url?: string };
    if (!json.url) {
      throw new Error("Storage did not return a URL");
    }

    return json.url;
  };

  const handleAssetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 20);
    event.target.value = "";

    if (!files.length) {
      return;
    }

    setError(null);
    setPublishMessage(null);

    const staged = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      mediaType: mediaTypeFromFile(file),
      previewUrl: URL.createObjectURL(file),
      status: "uploading" as const,
    }));

    setAssets((current) => {
      current.forEach((asset) => URL.revokeObjectURL(asset.previewUrl));
      return staged;
    });

    setIsUploadingAssets(true);

    await Promise.allSettled(
      files.map(async (file, index) => {
        const itemId = staged[index].id;

        if (staged[index].mediaType === "video") {
          try {
            const meta = await extractVideoMetadata(staged[index].previewUrl);
            setAssets((current) =>
              current.map((asset) =>
                asset.id === itemId
                  ? {
                      ...asset,
                      durationSec: meta.durationSec,
                      width: meta.width,
                      height: meta.height,
                      posterUrl: meta.posterUrl,
                    }
                  : asset,
              ),
            );
          } catch {
            setAssets((current) =>
              current.map((asset) =>
                asset.id === itemId
                  ? {
                      ...asset,
                      error: "Could not parse video metadata",
                    }
                  : asset,
              ),
            );
          }
        }

        try {
          const folder =
            staged[index].mediaType === "video" ? "videos" : "assets";
          const url = await uploadFileToStorage(file, folder);
          setAssets((current) =>
            current.map((asset) =>
              asset.id === itemId
                ? {
                    ...asset,
                    status: "uploaded",
                    storageUrl: url,
                  }
                : asset,
            ),
          );
        } catch (uploadError) {
          setAssets((current) =>
            current.map((asset) =>
              asset.id === itemId
                ? {
                    ...asset,
                    status: "local",
                    error:
                      uploadError instanceof Error
                        ? uploadError.message
                        : "Upload failed",
                  }
                : asset,
            ),
          );
        }
      }),
    );

    setIsUploadingAssets(false);
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setPublishMessage(null);

    const nextLogo: LocalAsset = {
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      mediaType: "image",
      previewUrl: URL.createObjectURL(file),
      status: "uploading",
    };

    setLogo((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return nextLogo;
    });

    setIsUploadingLogo(true);

    try {
      const url = await uploadFileToStorage(file, "logos");
      setLogo((current) =>
        current
          ? {
              ...current,
              status: "uploaded",
              storageUrl: url,
            }
          : null,
      );
    } catch (uploadError) {
      setLogo((current) =>
        current
          ? {
              ...current,
              status: "local",
              error:
                uploadError instanceof Error
                  ? uploadError.message
                  : "Upload failed",
            }
          : null,
      );
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const generate = async () => {
    setError(null);
    setPublishMessage(null);
    setIsGenerating(true);
    setRunClock(Date.now());

    const abortController = new AbortController();
    generationAbortRef.current = abortController;
    let finalResult: GenerationResponse | null = null;

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
          assets: assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            mediaType: asset.mediaType,
            durationSec: asset.durationSec,
            width: asset.width,
            height: asset.height,
          })),
          hasLogo: Boolean(logo),
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (!data) {
                continue;
              }

              try {
                const event = JSON.parse(data) as unknown;

                if (isGenerationRunEvent(event)) {
                  applyRunEvent(event);
                  if (event.type === "run-complete") {
                    finalResult = GenerationResponseSchema.parse(event.result);
                  } else if (event.type === "run-error") {
                    throw new Error(event.detail);
                  }
                  continue;
                }

                const legacy = event as {
                  type?: string;
                  message?: string;
                  result?: unknown;
                };

                if (legacy.type === "status" && legacy.message) {
                  if (!seededLegacyStream) {
                    applyRunEvent({
                      type: "run-start",
                      runId: crypto.randomUUID(),
                      label: "Generate SOTA Concepts",
                      detail: "Streaming generation updates.",
                    });
                    applyRunEvent({
                      type: "step-start",
                      stepId: "legacy-stream",
                      title: "Generate concepts",
                      detail: legacy.message,
                      phase: "execution",
                    });
                    seededLegacyStream = true;
                  } else {
                    applyRunEvent({
                      type: "heartbeat",
                      detail: legacy.message,
                    });
                  }
                } else if (legacy.type === "complete" && legacy.result) {
                  finalResult = GenerationResponseSchema.parse(legacy.result);
                  if (seededLegacyStream) {
                    applyRunEvent({
                      type: "step-complete",
                      stepId: "legacy-stream",
                      detail: "Generation stream completed.",
                    });
                  }
                  applyRunEvent({
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
            }
          }
        }

        if (!finalResult) {
          throw new Error(
            "Generation stream ended without results. Please try again.",
          );
        }
      } else {
        const parsed = GenerationResponseSchema.parse(await response.json());
        applyRunEvent({
          type: "run-start",
          runId: crypto.randomUUID(),
          label: "Generate SOTA Concepts",
          detail: "Running non-stream fallback path.",
        });
        applyRunEvent({
          type: "step-start",
          stepId: "fallback-json",
          title: "Generate concepts",
          detail: "Received a non-stream response from API.",
          phase: "execution",
        });
        applyRunEvent({
          type: "step-complete",
          stepId: "fallback-json",
          detail: "Concept payload received.",
        });
        applyRunEvent({
          type: "run-complete",
          result: parsed,
          summary: "Generated concept variants using fallback path.",
          fallbackUsed: true,
        });
        finalResult = parsed;
      }

      setResult(finalResult);
      setActiveVariantId(finalResult.variants[0]?.id ?? null);
      setOverlayLayouts(
        Object.fromEntries(
          finalResult.variants.map((variant) => [
            variant.id,
            createDefaultOverlayLayout(variant.layout),
          ]),
        ),
      );
      setShareUrl(null);
    } catch (generationError) {
      if (
        generationError instanceof Error &&
        generationError.name === "AbortError"
      ) {
        setAgentRun((current) => {
          if (!current || current.status !== "running") {
            return current;
          }

          const now = Date.now();
          return {
            ...current,
            status: "cancelled",
            endedAt: now,
            currentStepId: undefined,
            summary: "Generation stopped by user.",
            steps: current.steps.map((step) =>
              step.status === "active"
                ? {
                    ...step,
                    status: "cancelled",
                    detail: "Cancelled by user.",
                    endedAt: now,
                  }
                : step,
            ),
            logLines: [...current.logLines, "Run cancelled by user."],
          };
        });
        return;
      }

      const message =
        generationError instanceof Error
          ? generationError.message
          : "Unexpected generation issue.";
      setAgentRun((current) => {
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
      setError(
        message,
      );
    } finally {
      setIsGenerating(false);
      generationAbortRef.current = null;
    }
  };

  const renderPosterToDataUrl = async () => {
    if (!posterRef.current || !activeVariant) {
      throw new Error("No poster selected");
    }

    return toPng(posterRef.current, {
      cacheBust: true,
      pixelRatio: 3,
    });
  };

  const uploadRenderedPoster = async () => {
    const dataUrl = await renderPosterToDataUrl();
    const imageResponse = await fetch(dataUrl);
    const blob = await imageResponse.blob();

    const fileName = `${slugify(brand.brandName)}-${slugify(post.theme)}-${Date.now()}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    return uploadFileToStorage(file, "renders");
  };

  const exportPoster = async () => {
    if (!activeVariant) {
      return;
    }

    try {
      const dataUrl = await renderPosterToDataUrl();
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${slugify(brand.brandName)}-${slugify(post.theme)}.png`;
      link.click();
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Failed to export poster image",
      );
    }
  };

  const copyCaption = async () => {
    if (!activeVariant) {
      return;
    }

    const payload = `${activeVariant.caption}\n\n${activeVariant.hashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(payload);
      setCopyState("done");
      window.setTimeout(() => setCopyState("idle"), 1400);
    } catch {
      setCopyState("idle");
    }
  };

  const refineVariant = async () => {
    if (!activeVariant || !refineInstruction.trim()) {
      return;
    }

    setIsRefining(true);
    setError(null);

    try {
      const response = await fetch("/api/generate/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: activeVariant,
          instruction: refineInstruction.trim(),
          brand,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const json = await response.json();
      if (json.source !== "model") {
        throw new Error("Refinement could not be applied. Try a different instruction.");
      }

      const refined = json.variant;
      setResult((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          variants: current.variants.map((v) =>
            v.id === activeVariant.id ? { ...refined, id: activeVariant.id } : v,
          ),
        };
      });
      setRefineInstruction("");
    } catch (refineError) {
      setError(
        refineError instanceof Error ? refineError.message : "Refinement failed",
      );
    } finally {
      setIsRefining(false);
    }
  };

  const createShareLink = async () => {
    if (!result || !activeVariant) {
      return;
    }

    setError(null);
    setShareUrl(null);
    setIsSharing(true);

    try {
      const posterUrl = await uploadRenderedPoster();
      const response = await fetch("/api/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          post,
          assets: assets
            .filter((asset) => Boolean(asset.storageUrl))
            .map((asset) => ({
              id: asset.id,
              name: asset.name,
              mediaType: asset.mediaType,
              durationSec: asset.durationSec,
              posterUrl: asset.posterUrl,
              url: asset.storageUrl,
            })),
          logoUrl: logo?.storageUrl,
          result,
          activeVariantId: activeVariant.id,
          overlayLayouts,
          renderedPosterUrl: posterUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const json = (await response.json()) as { shareUrl?: string };
      if (!json.shareUrl) {
        throw new Error("No share link returned");
      }

      setShareUrl(json.shareUrl);
      try {
        await navigator.clipboard.writeText(json.shareUrl);
        setShareCopyState("done");
        window.setTimeout(() => setShareCopyState("idle"), 1400);
      } catch {
        setShareCopyState("idle");
      }
    } catch (shareError) {
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Could not create share link",
      );
    } finally {
      setIsSharing(false);
    }
  };

  const disconnectInstagram = async () => {
    setError(null);
    setPublishMessage(null);
    setIsDisconnecting(true);

    try {
      const response = await fetch("/api/auth/meta/disconnect", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      await loadAuthStatus();
      setPublishMessage("Instagram OAuth disconnected.");
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect Instagram OAuth",
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  const buildPublishPayload = async (variant: CreativeVariant) => {
    const sequenced = variant.assetSequence
      .map((assetId) => assetMap.get(assetId))
      .filter((asset): asset is LocalAsset => Boolean(asset));

    if (variant.postType === "reel") {
      const reelAsset =
        sequenced.find(
          (asset) => asset.mediaType === "video" && asset.storageUrl,
        ) ??
        assets.find(
          (asset) => asset.mediaType === "video" && asset.storageUrl,
        );

      if (!reelAsset?.storageUrl) {
        throw new Error(
          "Reel publishing requires at least one uploaded video asset.",
        );
      }

      return {
        mode: "reel" as const,
        videoUrl: reelAsset.storageUrl,
      };
    }

    if (variant.postType === "carousel") {
      const items = sequenced
        .filter(
          (asset): asset is LocalAsset & { storageUrl: string } =>
            Boolean(asset.storageUrl),
        )
        .slice(0, 10)
        .map((asset) => ({
          mediaType: asset.mediaType,
          url: asset.storageUrl,
        }));

      if (items.length < 2) {
        throw new Error(
          "Carousel publishing needs at least 2 uploaded media assets.",
        );
      }

      return {
        mode: "carousel" as const,
        items,
      };
    }

    const imageUrl = await uploadRenderedPoster();
    return {
      mode: "image" as const,
      imageUrl,
    };
  };

  const publishToInstagram = async (event: FormEvent) => {
    event.preventDefault();

    if (!activeVariant) {
      return;
    }

    if (!authStatus.connected) {
      setError(
        "Connect an Instagram account via OAuth (or set env credentials) before publishing.",
      );
      return;
    }

    setError(null);
    setPublishMessage(null);
    setIsPublishing(true);

    try {
      const media = await buildPublishPayload(activeVariant);
      const caption = `${activeVariant.caption}\n\n${activeVariant.hashtags.join(" ")}`;

      const response = await fetch("/api/meta/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          media,
          publishAt: scheduleAt
            ? new Date(scheduleAt).toISOString()
            : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const json = (await response.json()) as {
        status?: string;
        mode?: string;
        publishAt?: string;
      };

      if (json.status === "scheduled") {
        setPublishMessage(
          `Scheduled ${json.mode ? `${json.mode} ` : ""}post for ${new Date(
            json.publishAt ?? scheduleAt,
          ).toLocaleString()}`,
        );
      } else {
        setPublishMessage(
          `${json.mode ? `${json.mode} ` : ""}published to Instagram successfully.`,
        );
      }
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Instagram publish failed",
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const renderVariantTile = (variant: CreativeVariant) => {
    const isActive = variant.id === activeVariant?.id;

    return (
      <button
        key={variant.id}
        type="button"
        onClick={() => setActiveVariantId(variant.id)}
        className={cn(
          "w-full rounded-2xl border p-4 text-left transition-all duration-200",
          isActive
            ? "border-orange-400 bg-orange-500/10 shadow-[0_12px_40px_-24px_rgba(251,146,60,0.95)]"
            : "border-white/15 bg-slate-900/30 hover:border-white/30",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
            {variant.name}
          </p>
          <span className="rounded-full border border-white/20 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-200">
            {variant.postType}
          </span>
        </div>
        <p className="mt-2 text-sm font-medium text-white">
          {variant.headline}
        </p>
        <p className="mt-1 text-xs text-slate-300">
          {variant.layout} · {variant.assetSequence.length} asset(s)
        </p>
      </button>
    );
  };

  const runProgress =
    completionCounts.total > 0
      ? Math.round((completionCounts.completed / completionCounts.total) * 100)
      : 0;
  const runDurationMs = agentRun
    ? (agentRun.endedAt ?? runClock) - agentRun.startedAt
    : 0;

  return (
    <>
      <AppShell>
        <div className="pb-24 md:pb-28" aria-busy={isAgentBusy}>
          {hasBrand === false ? (
            <div className="mb-4 rounded-xl border border-orange-300/30 bg-orange-400/10 p-3 text-xs text-orange-100">
              No saved brand kit found.{" "}
              <Link href="/brand" className="font-semibold underline">
                Set up your Brand Kit
              </Link>{" "}
              for better results.
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
              <WandSparkles className="h-4 w-4 text-orange-300" />
              Post Brief + Assets
            </div>

            {/* Asset Upload (top, most visual) */}
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/30 bg-white/5 px-3 py-3 text-xs font-medium text-slate-200 transition hover:border-orange-300">
                <span className="inline-flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-orange-300" />
                  Upload Post Assets (Images + Video)
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleAssetUpload(event);
                  }}
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-white/30 bg-white/5 px-3 py-3 text-xs font-medium text-slate-200 transition hover:border-orange-300">
                <span className="inline-flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-orange-300" />
                  Upload Logo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void handleLogoUpload(event);
                  }}
                />
              </label>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {assets.map((asset) => (
                <span
                  key={asset.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium",
                    statusChip(asset.status),
                  )}
                >
                  {asset.mediaType === "video" ? (
                    <Film className="h-3 w-3" />
                  ) : (
                    <Images className="h-3 w-3" />
                  )}
                  {asset.name}
                  {asset.mediaType === "video" && asset.durationSec
                    ? ` (${formatDuration(asset.durationSec)})`
                    : ""}
                  {asset.status === "uploading" ? " (syncing)" : ""}
                  {asset.status === "local" ? " (local only)" : ""}
                </span>
              ))}
              {logo ? (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-medium",
                    statusChip(logo.status),
                  )}
                >
                  Logo: {logo.name}
                  {logo.status === "uploading" ? " (syncing)" : ""}
                </span>
              ) : null}
            </div>

            {/* Theme + Subject (side by side) */}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-200">
                  Theme
                </span>
                <input
                  value={post.theme}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      theme: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-200">
                  Subject
                </span>
                <input
                  value={post.subject}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                />
              </label>

              {/* Core Thought (full width) */}
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-200">
                  Core Thought
                </span>
                <textarea
                  value={post.thought}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      thought: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                />
              </label>

              {/* Objective + Audience (side by side) */}
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-200">
                  Objective
                </span>
                <input
                  value={post.objective}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      objective: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-200">
                  Audience
                </span>
                <input
                  value={post.audience}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      audience: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                />
              </label>

              {/* Mood + Aspect Ratio (side by side) */}
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-200">
                  Mood
                </span>
                <input
                  value={post.mood}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      mood: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-200">
                  Aspect Ratio
                </span>
                <select
                  value={post.aspectRatio}
                  onChange={(event) =>
                    setPost((current) => ({
                      ...current,
                      aspectRatio: event.target.value as AspectRatio,
                    }))
                  }
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
                >
                  {RATIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Generate button + status */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={
                  isGenerating ||
                  assets.length === 0 ||
                  isUploadingAssets ||
                  isUploadingLogo
                }
                className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating ? "Generating..." : "Generate SOTA Concepts"}
              </button>

              <button
                type="button"
                onClick={exportPoster}
                disabled={!activeVariant}
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export PNG
              </button>

              {!llmAuthStatus.connected ? (
                <p className="text-xs text-slate-400">
                  <Link href="/settings" className="underline">
                    Connect an LLM provider
                  </Link>{" "}
                  for AI-powered generation.
                </p>
              ) : null}

              {isUploadingAssets || isUploadingLogo ? (
                <p className="text-xs text-blue-200">
                  Uploading assets to persistent storage...
                </p>
              ) : null}
              {error ? (
                <p className="text-xs font-medium text-red-300">{error}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-5 lg:sticky lg:top-6 lg:h-fit">
          <div
            ref={activityPanelRef}
            className="rounded-3xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-xl md:p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-blue-100 uppercase">
                  Agent Activity
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Reasoning steps, planning phases, and execution status.
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                  statusStyle(agentRun?.status ?? "idle"),
                )}
              >
                {agentRun?.status ?? "idle"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-[11px] text-slate-200">
                Verbosity
                <select
                  value={agentVerbosity}
                  onChange={(event) =>
                    setAgentVerbosity(event.target.value as AgentVerbosity)
                  }
                  className="bg-transparent text-[11px] font-semibold outline-none"
                >
                  <option value="minimal" className="bg-slate-900 text-white">
                    Minimal
                  </option>
                  <option value="standard" className="bg-slate-900 text-white">
                    Standard
                  </option>
                  <option value="verbose" className="bg-slate-900 text-white">
                    Verbose
                  </option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setShowStepDetails((current) => !current)}
                disabled={!agentRun?.steps.length}
                className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showStepDetails ? "Collapse Steps" : "Expand Steps"}
              </button>

              <button
                type="button"
                onClick={() => {
                  void copyRunLog();
                }}
                disabled={!agentRun}
                className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runLogCopyState === "done" ? "Copied" : "Copy Diagnostics"}
              </button>
            </div>

            {agentRun ? (
              <>
                <div className="mt-3 rounded-xl border border-white/15 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">
                      {agentRun.label}
                    </p>
                    <p className="text-[11px] text-slate-300">
                      {formatElapsed(runDurationMs)}
                    </p>
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
                  <div className="mt-3 space-y-2">
                    {visibleAgentSteps.length ? (
                      visibleAgentSteps.map((step) => {
                        const stepDuration =
                          typeof step.startedAt === "number"
                            ? formatElapsed(
                                (step.endedAt ?? runClock) - step.startedAt,
                              )
                            : "n/a";

                        return (
                          <div
                            key={step.id}
                            className={cn(
                              "rounded-xl border bg-white/5 p-2.5",
                              step.status === "active"
                                ? "border-blue-300/35"
                                : step.status === "error"
                                  ? "border-red-300/35"
                                  : "border-white/15",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="inline-flex items-center gap-2 text-xs font-semibold text-slate-100">
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    stepDotStyle(step.status),
                                  )}
                                />
                                {step.title}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {phaseLabel(step.phase)} · {stepDuration}
                              </p>
                            </div>
                            {step.detail ? (
                              <p className="mt-1 text-[11px] text-slate-300">
                                {step.detail}
                              </p>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-xs text-slate-300">
                        Step list is empty for this run.
                      </p>
                    )}
                  </div>
                ) : null}

                {agentVerbosity === "verbose" && showStepDetails ? (
                  <div className="mt-3 rounded-xl border border-white/15 bg-black/30 p-3">
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
              <p className="mt-3 rounded-xl border border-dashed border-white/20 bg-white/5 p-3 text-xs text-slate-300">
                No active run yet. Start generation to see planning and execution steps.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-xl md:p-5">
            {activeVariant ? (
              <motion.div
                key={activeVariant.id}
                initial={{ opacity: 0.2 }}
                animate={{ opacity: 1 }}
              >
                <PosterPreview
                  ref={posterRef}
                  variant={activeVariant}
                  brandName={brand.brandName}
                  aspectRatio={post.aspectRatio}
                  primaryImage={primaryVisual}
                  secondaryImage={secondaryVisual}
                  logoImage={logo?.previewUrl}
                  editorMode={editorMode}
                  overlayLayout={activeOverlayLayout}
                  onOverlayLayoutChange={(layout) => {
                    if (!activeVariant) {
                      return;
                    }

                    setOverlayLayouts((current) => ({
                      ...current,
                      [activeVariant.id]: layout,
                    }));
                  }}
                  carouselSlides={activeVariant.carouselSlides}
                  activeSlideIndex={activeSlideIndex}
                  onSlideChange={setActiveSlideIndex}
                />
              </motion.div>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center rounded-3xl border border-dashed border-white/25 bg-white/5 text-sm text-slate-300">
                Upload assets and generate concepts to preview your post.
              </div>
            )}
          </div>

          {result ? (
            <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-xl md:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-[0.2em] text-orange-200 uppercase">
                  Strategy
                </p>
                <button
                  type="button"
                  onClick={() => setEditorMode((value) => !value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-semibold uppercase transition",
                    editorMode
                      ? "border-orange-300/50 bg-orange-500/15 text-orange-100"
                      : "border-white/30 bg-white/5 text-slate-200 hover:bg-white/10",
                  )}
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  {editorMode ? "Editor On" : "Editor Off"}
                </button>
              </div>

              <p className="text-sm leading-relaxed text-slate-200">
                {result.strategy}
              </p>

              <div className="mt-4 grid gap-2">
                {result.variants.map(renderVariantTile)}
              </div>

              {activeVariant ? (
                <>
                  {activeVariant.postType === "carousel" &&
                  activeVariant.carouselSlides ? (
                    <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
                      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                        Carousel Slide Plan
                      </p>
                      <div className="mt-3 space-y-2">
                        {activeVariant.carouselSlides.map((slide) => (
                          <div
                            key={`${activeVariant.id}-slide-${slide.index}`}
                            className="rounded-xl border border-white/10 bg-white/5 p-2.5"
                          >
                            <p className="text-[11px] font-semibold text-orange-200">
                              Slide {slide.index}: {slide.goal}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-100">
                              {slide.headline}
                            </p>
                            <p className="mt-1 text-xs text-slate-300">
                              {slide.body}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              Asset hint: {slide.assetHint}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeVariant.postType === "reel" &&
                  activeVariant.reelPlan ? (
                    <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
                      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                        Reel Edit Blueprint
                      </p>
                      <p className="mt-2 text-sm text-slate-200">
                        Hook: {activeVariant.reelPlan.hook}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        Target duration:{" "}
                        {Math.round(
                          activeVariant.reelPlan.targetDurationSec,
                        )}
                        s
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        Cover frame:{" "}
                        {activeVariant.reelPlan.coverFrameDirection}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        Audio: {activeVariant.reelPlan.audioDirection}
                      </p>
                      <div className="mt-3 space-y-1.5">
                        {activeVariant.reelPlan.editingActions.map(
                          (action, index) => (
                            <p
                              key={`${activeVariant.id}-edit-${index}`}
                              className="text-xs text-slate-200"
                            >
                              • {action}
                            </p>
                          ),
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        {activeVariant.reelPlan.beats.map((beat, index) => (
                          <div
                            key={`${activeVariant.id}-beat-${index}`}
                            className="rounded-xl border border-white/10 bg-white/5 p-2.5"
                          >
                            <p className="text-[11px] font-semibold text-orange-200">
                              {beat.atSec.toFixed(1)}s
                            </p>
                            <p className="mt-1 text-xs text-slate-100">
                              {beat.visual}
                            </p>
                            <p className="mt-1 text-xs text-slate-300">
                              On-screen: {beat.onScreenText}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              Edit: {beat.editAction}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs font-semibold text-emerald-200">
                        End card CTA: {activeVariant.reelPlan.endCardCta}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                        Caption Bundle
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void copyCaption();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-xs text-white transition hover:bg-white/10"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copyState === "done" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-slate-200">
                      {activeVariant.caption}
                    </p>
                    <p className="mt-3 text-xs text-orange-200">
                      {activeVariant.hashtags.join(" ")}
                    </p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
                    <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                      Refine This Variant
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={refineInstruction}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setRefineInstruction(e.target.value)
                        }
                        placeholder="e.g. shorter caption, more premium tone, stronger hook..."
                        className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-300"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            void refineVariant();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void refineVariant();
                        }}
                        disabled={isRefining || !refineInstruction.trim()}
                        className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRefining ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <WandSparkles className="h-3.5 w-3.5" />
                        )}
                        {isRefining ? "Refining..." : "Refine"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 p-4">
                    <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
                      Share + Publish
                    </p>

                    <div className="mt-3 rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-200">
                      <p className="font-semibold text-slate-100">
                        Instagram Account
                      </p>

                      {isAuthLoading ? (
                        <p className="mt-1 text-slate-300">
                          Checking connection...
                        </p>
                      ) : null}

                      {!isAuthLoading && authStatus.connected ? (
                        <div className="mt-1 space-y-1">
                          <p>
                            Connected via{" "}
                            <span className="font-semibold uppercase">
                              {authStatus.source}
                            </span>
                            {authStatus.account?.instagramUsername
                              ? ` as @${authStatus.account.instagramUsername}`
                              : ""}
                            {authStatus.account?.pageName
                              ? ` (${authStatus.account.pageName})`
                              : ""}
                          </p>
                          {authStatus.account?.tokenExpiresAt ? (
                            <p className="text-slate-300">
                              Token expiry:{" "}
                              {new Date(
                                authStatus.account.tokenExpiresAt,
                              ).toLocaleString()}
                            </p>
                          ) : null}

                          {authStatus.source === "oauth" ? (
                            <button
                              type="button"
                              onClick={() => {
                                void disconnectInstagram();
                              }}
                              disabled={isDisconnecting}
                              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isDisconnecting ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              Disconnect OAuth
                            </button>
                          ) : (
                            <a
                              href="/api/auth/meta/start"
                              className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/10"
                            >
                              Reconnect with OAuth
                            </a>
                          )}
                        </div>
                      ) : null}

                      {!isAuthLoading && !authStatus.connected ? (
                        <div className="mt-2">
                          <p className="text-slate-300">
                            Connect your brand account to publish directly from
                            this app.
                          </p>
                          <a
                            href="/api/auth/meta/start"
                            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-400 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-blue-300"
                          >
                            Connect with Meta OAuth
                          </a>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void createShareLink();
                        }}
                        disabled={isSharing}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSharing ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        Create Share Link
                      </button>

                      <button
                        type="button"
                        disabled={!activeVariant}
                        onClick={() => {
                          if (!activeVariant) {
                            return;
                          }

                          setOverlayLayouts((current) => ({
                            ...current,
                            [activeVariant.id]: createDefaultOverlayLayout(
                              activeVariant.layout,
                            ),
                          }));
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <LayoutTemplate className="h-3.5 w-3.5" />
                        Reset Text Layout
                      </button>
                    </div>

                    {shareUrl ? (
                      <div className="mt-3 rounded-xl border border-emerald-300/35 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                        <p className="font-semibold">Share link ready:</p>
                        <p className="mt-1 break-all">{shareUrl}</p>
                        <p className="mt-1">
                          {shareCopyState === "done"
                            ? "Copied to clipboard"
                            : "Copied automatically when created"}
                        </p>
                      </div>
                    ) : null}

                    <form
                      onSubmit={publishToInstagram}
                      className="mt-4 grid gap-2"
                    >
                      <label className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-300">
                          Schedule (optional)
                        </span>
                        <input
                          type="datetime-local"
                          value={scheduleAt}
                          onChange={(event) =>
                            setScheduleAt(event.target.value)
                          }
                          className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs outline-none transition focus:border-orange-300"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={isPublishing}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPublishing ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {scheduleAt
                          ? "Schedule Instagram Publish"
                          : "Publish to Instagram"}
                      </button>
                    </form>

                    {publishMessage ? (
                      <p className="mt-3 rounded-xl border border-emerald-300/35 bg-emerald-400/10 p-2 text-xs text-emerald-100">
                        {publishMessage}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
          </div>
        </div>
      </AppShell>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 md:px-8">
          <div className="min-w-0 flex-1">
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "flex items-center gap-2 text-xs font-medium",
                statusLine.tone === "error"
                  ? "text-red-200"
                  : statusLine.tone === "success"
                    ? "text-emerald-200"
                    : statusLine.tone === "active"
                      ? "text-blue-200"
                      : "text-slate-200",
              )}
            >
              <span
                className={cn(
                  "inline-block h-2 w-2 flex-none rounded-full",
                  statusLine.tone === "error"
                    ? "bg-red-300"
                    : statusLine.tone === "success"
                      ? "bg-emerald-300"
                      : statusLine.tone === "active"
                        ? "bg-blue-300"
                        : "bg-slate-400",
                )}
              />
              <span className="truncate">{statusLine.text}</span>
            </p>
            {statusLine.tone === "error" ? (
              <p role="alert" className="sr-only">
                {statusLine.text}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {typeof statusLine.elapsedMs === "number" ? (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
                {formatElapsed(statusLine.elapsedMs)}
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => {
                activityPanelRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
                setShowStepDetails(true);
              }}
              className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
            >
              View Details
            </button>

            {statusLine.showStop ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300/35 bg-red-400/10 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-400/20"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            ) : null}

            {(agentRun?.status === "error" || agentRun?.status === "cancelled") &&
            canRetryGeneration ? (
              <button
                type="button"
                onClick={() => {
                  void generate();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
