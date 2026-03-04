"use client";

import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Palette,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePostContext } from "@/contexts/post-context";

const STORAGE_KEY = "ig-poster-onboarding";

type ChecklistState = {
  dismissed: boolean;
  collapsed: boolean;
  completedSteps: string[];
};

type Step = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  href?: string;
  checkFn?: string; // key to check dynamically
};

const STEPS: Step[] = [
  {
    id: "llm",
    label: "Connect AI provider",
    description: "Set up OpenAI or Anthropic for content generation.",
    icon: <BrainCircuit className="h-4 w-4" />,
    href: "/settings",
  },
  {
    id: "brand",
    label: "Set up brand kit",
    description: "Define your brand voice, colors, and style.",
    icon: <Palette className="h-4 w-4" />,
    href: "/brand",
  },
  {
    id: "logo",
    label: "Upload your logo",
    description: "Add a logo for poster overlays.",
    icon: <ImagePlus className="h-4 w-4" />,
    href: "/brand",
  },
  {
    id: "post",
    label: "Create first post",
    description: "Start a new post brief with assets.",
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    id: "generate",
    label: "Generate concepts",
    description: "Let AI create creative variants for your post.",
    icon: <WandSparkles className="h-4 w-4" />,
  },
];

function loadState(): ChecklistState {
  if (typeof window === "undefined") {
    return { dismissed: false, collapsed: false, completedSteps: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { dismissed: false, collapsed: false, completedSteps: [] };
}

function saveState(state: ChecklistState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function OnboardingChecklist() {
  const { posts, activePost } = usePostContext();

  const [state, setState] = useState<ChecklistState>(loadState);
  // API-detected steps stored separately to avoid setState in the mount effect
  const [apiSteps, setApiSteps] = useState<string[]>([]);

  // Check LLM and brand on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const detected: string[] = [];

      try {
        const llmRes = await fetch("/api/auth/llm/status", { cache: "no-store" });
        const llm = await llmRes.json();
        if (llm?.connected) detected.push("llm");
      } catch {
        // ignore
      }

      try {
        const settingsRes = await fetch("/api/settings", { cache: "no-store" });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings?.brand?.brandName) detected.push("brand");
          if (settings?.logoUrl) detected.push("logo");
        }
      } catch {
        // ignore
      }

      if (!cancelled && detected.length > 0) setApiSteps(detected);
    };

    void check();
    return () => { cancelled = true; };
  }, []);

  // Derive completed steps from saved state + context + API (pure computation)
  const completedSteps = useMemo(() => {
    const auto: string[] = [...state.completedSteps, ...apiSteps];
    if (posts.length > 0) auto.push("post");
    if (activePost?.result?.variants?.length) auto.push("generate");
    return [...new Set(auto)];
  }, [state.completedSteps, apiSteps, posts, activePost]);

  // Persist when completedSteps grow beyond what's saved
  useEffect(() => {
    if (completedSteps.length > state.completedSteps.length) {
      const next = { ...state, completedSteps };
      saveState(next);
    }
  }, [completedSteps, state]);

  const completedCount = completedSteps.length;
  const allDone = completedCount >= STEPS.length;
  const progress = Math.round((completedCount / STEPS.length) * 100);

  const dismiss = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, dismissed: true };
      saveState(next);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, collapsed: !prev.collapsed };
      saveState(next);
      return next;
    });
  }, []);

  if (state.dismissed || allDone) return null;

  return (
    <section aria-label="Getting started checklist" className="mb-4 animate-fade-in-up rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-300" />
          <span className="text-xs font-semibold text-white">
            Getting Started
          </span>
          <span className="text-[11px] text-slate-400">
            {completedCount}/{STEPS.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleCollapse}
            className="text-slate-400"
            aria-label={state.collapsed ? "Expand checklist" : "Collapse checklist"}
          >
            {state.collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={dismiss}
            className="text-slate-400"
            aria-label="Dismiss checklist"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-orange-400 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {!state.collapsed && (
        <div className="mt-3 space-y-1">
          {STEPS.map((step) => {
            const done = completedSteps.includes(step.id);
            return (
              <div
                key={step.id}
                className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition ${
                  done ? "opacity-50" : ""
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-emerald-400/50 bg-emerald-400/20"
                      : "border-white/20 bg-white/5"
                  }`}
                >
                  {done ? (
                    <Check className="h-2.5 w-2.5 text-emerald-300" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {step.href && !done ? (
                    <Link
                      href={step.href}
                      className="text-xs font-medium text-white hover:text-orange-200"
                    >
                      {step.label}
                    </Link>
                  ) : (
                    <p
                      className={`text-xs font-medium ${done ? "text-slate-400 line-through" : "text-white"}`}
                    >
                      {step.label}
                    </p>
                  )}
                  {!done && (
                    <p className="text-[11px] text-slate-500">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
