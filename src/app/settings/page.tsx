"use client";

import { BrainCircuit, KeyRound, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  PROVIDER_DEFAULT_MODELS,
  type LlmProvider,
} from "@/lib/llm-constants";
import type { LlmAuthStatus } from "@/lib/types";
import { parseApiError } from "@/lib/upload-helpers";

export default function SettingsPage() {
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("openai");
  const [llmApiKeyInput, setLlmApiKeyInput] = useState("");
  const [llmModelInput, setLlmModelInput] = useState(
    PROVIDER_DEFAULT_MODELS.openai,
  );

  const [isLlmAuthLoading, setIsLlmAuthLoading] = useState(true);
  const [isLlmConnecting, setIsLlmConnecting] = useState(false);
  const [isLlmDisconnecting, setIsLlmDisconnecting] = useState(false);
  const [llmMessage, setLlmMessage] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmAuthStatus, setLlmAuthStatus] = useState<LlmAuthStatus>({
    connected: false,
    source: null,
  });

  const loadLlmStatus = useCallback(async () => {
    setIsLlmAuthLoading(true);
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
    } finally {
      setIsLlmAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLlmStatus();
  }, [loadLlmStatus]);

  useEffect(() => {
    if (!llmAuthStatus.provider) {
      return;
    }

    setLlmProvider(llmAuthStatus.provider);
    setLlmModelInput(
      llmAuthStatus.model || PROVIDER_DEFAULT_MODELS[llmAuthStatus.provider],
    );
  }, [llmAuthStatus.model, llmAuthStatus.provider]);

  // Load saved AI config from settings
  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) return;
        const json = await response.json();
        if (json?.aiConfig?.provider) {
          setLlmProvider(json.aiConfig.provider);
        }
        if (json?.aiConfig?.model) {
          setLlmModelInput(json.aiConfig.model);
        }
      } catch {
        // Settings may not be available (no auth, no blob)
      }
    };

    void loadSavedConfig();
  }, []);

  const connectLlmProvider = async () => {
    const apiKey = llmApiKeyInput.trim();
    if (!apiKey) {
      setLlmMessage(null);
      setLlmError("Enter an API key to connect an LLM provider.");
      return;
    }

    setLlmMessage(null);
    setLlmError(null);
    setIsLlmConnecting(true);

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), 20_000);

    try {
      const response = await fetch("/api/auth/llm/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          provider: llmProvider,
          apiKey,
          model: llmModelInput.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const json = (await response.json()) as {
        provider?: LlmProvider;
        model?: string;
        storage?: "blob" | "cookie";
      };

      await loadLlmStatus();
      const resolvedModel = (json.model ?? llmModelInput) || "default model";
      setLlmModelInput(json.model ?? llmModelInput);
      const storageHint =
        json.storage === "cookie" ? " (encrypted cookie fallback)" : "";
      setLlmMessage(
        `LLM provider connected (${(json.provider ?? llmProvider).toUpperCase()} ${resolvedModel})${storageHint}.`,
      );

      // Persist AI config to settings
      try {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aiConfig: {
              provider: json.provider ?? llmProvider,
              model: json.model ?? llmModelInput,
            },
          }),
        });
      } catch {
        // Non-critical
      }
    } catch (connectError) {
      const message =
        connectError instanceof Error && connectError.name === "AbortError"
          ? "LLM connection timed out. Check your key/model and try again."
          : connectError instanceof Error
            ? connectError.message
            : "Could not connect LLM provider";
      setLlmError(message);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLlmConnecting(false);
      setLlmApiKeyInput("");
    }
  };

  const disconnectLlmProvider = async () => {
    if (llmAuthStatus.source !== "connection") {
      return;
    }

    setLlmMessage(null);
    setLlmError(null);
    setIsLlmDisconnecting(true);

    try {
      const response = await fetch("/api/auth/llm/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      await loadLlmStatus();
      setLlmMessage(
        "Disconnected saved LLM key. Environment credentials remain available if configured.",
      );
    } catch (disconnectError) {
      const message =
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect LLM provider";
      setLlmError(message);
    } finally {
      setIsLlmDisconnecting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-lg font-semibold text-white">Settings</h1>

        <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <BrainCircuit className="h-4 w-4 text-orange-300" />
            LLM Provider
          </div>

          <div className="rounded-xl border border-white/15 bg-black/20 p-3 text-xs text-slate-200">
            {isLlmAuthLoading ? (
              <p>Checking provider status...</p>
            ) : llmAuthStatus.connected ? (
              <p>
                Connected via{" "}
                <span className="font-semibold uppercase">
                  {llmAuthStatus.source}
                </span>
                :{" "}
                <span className="font-semibold uppercase">
                  {llmAuthStatus.provider}
                </span>{" "}
                ({llmAuthStatus.model})
              </p>
            ) : (
              <p>{llmAuthStatus.detail || "No provider connected yet."}</p>
            )}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">
                Provider
              </span>
              <select
                value={llmProvider}
                onChange={(event) => {
                  const nextProvider = event.target.value as LlmProvider;
                  const currentDefault = PROVIDER_DEFAULT_MODELS[llmProvider];
                  const shouldReplaceModel =
                    !llmModelInput.trim() || llmModelInput === currentDefault;
                  setLlmProvider(nextProvider);
                  if (shouldReplaceModel) {
                    setLlmModelInput(PROVIDER_DEFAULT_MODELS[nextProvider]);
                  }
                }}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">
                Model (optional)
              </span>
              <input
                value={llmModelInput}
                onChange={(event) => setLlmModelInput(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
          </div>

          <label className="mt-3 block space-y-1">
            <span className="text-xs font-medium text-slate-200">API Key</span>
            <input
              type="password"
              autoComplete="off"
              value={llmApiKeyInput}
              onChange={(event) => setLlmApiKeyInput(event.target.value)}
              placeholder={
                llmProvider === "anthropic" ? "sk-ant-..." : "sk-..."
              }
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
            />
            <p className="text-[11px] text-slate-400">
              Stored encrypted at rest. Uses Blob storage when configured,
              otherwise falls back to an encrypted `httpOnly` cookie.
            </p>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void connectLlmProvider();
              }}
              disabled={
                isLlmConnecting ||
                isLlmDisconnecting ||
                !llmApiKeyInput.trim()
              }
              className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLlmConnecting ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              {isLlmConnecting ? "Connecting..." : "Connect Provider"}
            </button>

            <button
              type="button"
              onClick={() => {
                void disconnectLlmProvider();
              }}
              disabled={
                isLlmDisconnecting || llmAuthStatus.source !== "connection"
              }
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLlmDisconnecting ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Disconnect Saved Key
            </button>
          </div>

          {llmMessage ? (
            <p className="mt-3 text-xs text-emerald-200">{llmMessage}</p>
          ) : null}
          {llmError ? (
            <p className="mt-2 text-xs text-red-300">{llmError}</p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
