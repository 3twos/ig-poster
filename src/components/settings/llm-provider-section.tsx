"use client";

import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  GripVertical,
  KeyRound,
  LoaderCircle,
  Monitor,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PROVIDER_DEFAULT_MODELS,
  type LlmProvider,
  type MultiModelMode,
} from "@/lib/llm-constants";
import type { LlmConnectionStatus, LlmMultiAuthStatus } from "@/lib/types";
import { parseApiError } from "@/lib/upload-helpers";

export function LlmProviderSection() {
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("openai");
  const [llmApiKeyInput, setLlmApiKeyInput] = useState("");
  const [llmModelInput, setLlmModelInput] = useState(PROVIDER_DEFAULT_MODELS.openai);
  const [showAddForm, setShowAddForm] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [connections, setConnections] = useState<LlmConnectionStatus[]>([]);
  const [mode, setMode] = useState<MultiModelMode>("fallback");

  const dragItemRef = useRef<number | null>(null);
  const dragOverItemRef = useRef<number | null>(null);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/llm/status", { cache: "no-store" });
      const json = (await response.json()) as LlmMultiAuthStatus;
      setConnections(json.connections ?? []);
      setMode(json.mode ?? "fallback");
    } catch {
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const saveOrder = useCallback(
    async (newConnections: LlmConnectionStatus[], newMode: MultiModelMode) => {
      setIsSavingOrder(true);
      try {
        const response = await fetch("/api/auth/llm/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionOrder: newConnections.map((c) => c.id), mode: newMode }),
        });
        if (!response.ok) throw new Error(await parseApiError(response));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save model ordering");
      } finally {
        setIsSavingOrder(false);
      }
    },
    [],
  );

  const moveConnection = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= connections.length || toIndex >= connections.length) return;
      const updated = [...connections];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      setConnections(updated);
      void saveOrder(updated, mode);
    },
    [connections, mode, saveOrder],
  );

  const handleDragStart = (index: number) => { dragItemRef.current = index; };
  const handleDragOver = (e: DragEvent, index: number) => { e.preventDefault(); dragOverItemRef.current = index; };
  const handleDrop = () => {
    if (dragItemRef.current !== null && dragOverItemRef.current !== null && dragItemRef.current !== dragOverItemRef.current) {
      moveConnection(dragItemRef.current, dragOverItemRef.current);
    }
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  const handleModeChange = (newMode: MultiModelMode) => { setMode(newMode); void saveOrder(connections, newMode); };

  const connectProvider = async () => {
    const apiKey = llmApiKeyInput.trim();
    if (!apiKey) { toast.error("Enter an API key to connect an LLM provider."); return; }
    setIsConnecting(true);
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), 20_000);
    try {
      const response = await fetch("/api/auth/llm/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({ provider: llmProvider, apiKey, model: llmModelInput.trim() }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const json = (await response.json()) as { provider?: LlmProvider; model?: string; connectionId?: string; storage?: "database" | "cookie" };
      await loadStatus();
      toast.success(`Connected ${(json.provider ?? llmProvider).toUpperCase()} (${(json.model ?? llmModelInput) || "default model"}).`);
      setShowAddForm(false);
      setLlmApiKeyInput("");
      try {
        await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aiConfig: { provider: json.provider ?? llmProvider, model: json.model ?? llmModelInput } }) });
      } catch { /* Non-critical */ }
    } catch (connectError) {
      const message = connectError instanceof Error && connectError.name === "AbortError"
        ? "Connection timed out. Check your key/model and try again."
        : connectError instanceof Error ? connectError.message : "Could not connect provider";
      toast.error(message);
    } finally {
      window.clearTimeout(timeoutId);
      setIsConnecting(false);
    }
  };

  const disconnectConnection = async (connectionId: string) => {
    setDisconnectingId(connectionId);
    try {
      const response = await fetch("/api/auth/llm/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId }) });
      if (!response.ok) throw new Error(await parseApiError(response));
      await loadStatus();
      toast.success("Model disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setDisconnectingId(null);
    }
  };

  const providerLabel = (provider: LlmProvider) => provider === "openai" ? "OpenAI" : "Anthropic";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <BrainCircuit className="h-4 w-4 text-orange-300" />
          LLM Providers
        </div>

        {connections.length > 1 && (
          <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <Label className="mb-2 block text-xs text-slate-300">Execution Mode</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleModeChange("fallback")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === "fallback" ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300"}`}>
                Fallback
                <span className="mt-0.5 block text-[10px] font-normal opacity-70">Try models in order. First success wins.</span>
              </button>
              <button type="button" onClick={() => handleModeChange("parallel")} className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === "parallel" ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300"}`}>
                Parallel
                <span className="mt-0.5 block text-[10px] font-normal opacity-70">Query all models. Pick best variants.</span>
              </button>
            </div>
            {isSavingOrder && <p className="mt-1.5 text-[10px] text-slate-500">Saving...</p>}
          </div>
        )}

        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center text-xs text-slate-400">
              No providers connected yet. Add a model below.
            </div>
          ) : (
            connections.map((conn, index) => (
              <div
                key={conn.id}
                draggable={connections.length > 1}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={handleDrop}
                className="group flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 transition-colors hover:border-white/20"
              >
                {connections.length > 1 && (
                  <div className="flex flex-col items-center gap-0.5">
                    <GripVertical className="h-3.5 w-3.5 cursor-grab text-slate-500 active:cursor-grabbing" />
                  </div>
                )}
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-white">{providerLabel(conn.provider)}</span>
                    <span className="text-xs text-slate-400">{conn.model}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    {conn.source === "env" ? (<><Monitor className="h-2.5 w-2.5" />auto-detected (env)</>) : (<><KeyRound className="h-2.5 w-2.5" />connected (BYOK)</>)}
                  </div>
                </div>
                {connections.length > 1 && (
                  <div className="flex flex-col gap-0.5">
                    <button type="button" disabled={index === 0} onClick={() => moveConnection(index, index - 1)} aria-label="Move model up" className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-300 disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                    <button type="button" disabled={index === connections.length - 1} onClick={() => moveConnection(index, index + 1)} aria-label="Move model down" className="rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-300 disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                  </div>
                )}
                {conn.removable && (
                  <button type="button" onClick={() => void disconnectConnection(conn.id)} disabled={disconnectingId === conn.id} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50" title="Disconnect" aria-label="Disconnect model">
                    {disconnectingId === conn.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {!showAddForm ? (
          <Button variant="outline" className="mt-3 w-full" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Model Connection
          </Button>
        ) : (
          <div className="mt-3 rounded-xl border border-white/15 bg-black/10 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-300">Connect a new model</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="llm-provider">Provider</Label>
                <Select value={llmProvider} onValueChange={(value) => { const nextProvider = value as LlmProvider; const currentDefault = PROVIDER_DEFAULT_MODELS[llmProvider]; const shouldReplaceModel = !llmModelInput.trim() || llmModelInput === currentDefault; setLlmProvider(nextProvider); if (shouldReplaceModel) setLlmModelInput(PROVIDER_DEFAULT_MODELS[nextProvider]); }}>
                  <SelectTrigger id="llm-provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="llm-model">Model (optional)</Label>
                <Input id="llm-model" value={llmModelInput} onChange={(event) => setLlmModelInput(event.target.value)} />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <Label htmlFor="llm-key">API Key</Label>
              <Input id="llm-key" type="password" autoComplete="off" value={llmApiKeyInput} onChange={(event) => setLlmApiKeyInput(event.target.value)} placeholder={llmProvider === "anthropic" ? "sk-ant-..." : "sk-..."} />
              <p className="text-[11px] text-slate-400">Stored encrypted at rest. Uses database when configured, otherwise falls back to an encrypted httpOnly cookie.</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => void connectProvider()} disabled={isConnecting || !llmApiKeyInput.trim()}>
                {isConnecting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowAddForm(false); setLlmApiKeyInput(""); }} disabled={isConnecting}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
