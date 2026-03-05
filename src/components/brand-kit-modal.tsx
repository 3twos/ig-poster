"use client";

import {
  ArrowLeft,
  ImagePlus,
  LoaderCircle,
  Palette,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { BrandKitRow } from "@/db/schema";
import { DEFAULT_GENERATION_SYSTEM_PROMPT } from "@/lib/creative";
import {
  type BrandState,
  type LocalAsset,
  type PromptConfigState,
  INITIAL_BRAND,
} from "@/lib/types";
import { parseApiError, statusChip } from "@/lib/upload-helpers";
import { cn } from "@/lib/utils";

interface BrandKitModalProps {
  open: boolean;
  onClose: () => void;
}

export function BrandKitModal({ open, onClose }: BrandKitModalProps) {
  const [brand, setBrand] = useState<BrandState>(INITIAL_BRAND);
  const [logo, setLogo] = useState<LocalAsset | null>(null);
  const [promptConfig, setPromptConfig] = useState<PromptConfigState>({
    systemPrompt: "",
    customInstructions: "",
  });

  const [isAutofillingBrand, setIsAutofillingBrand] = useState(false);
  const [isCreatingKit, setIsCreatingKit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastAutofilledWebsite, setLastAutofilledWebsite] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const savedSnapshotRef = useRef<string>("");

  const [kits, setKits] = useState<BrandKitRow[]>([]);
  const [activeKitId, setActiveKitId] = useState<string | null>(null);
  const [kitName, setKitName] = useState("Default");

  const logoCleanupRef = useRef<LocalAsset | null>(null);

  const computeSnapshot = useCallback(() => {
    return JSON.stringify({ brand, promptConfig, logoUrl: logo?.storageUrl });
  }, [brand, promptConfig, logo?.storageUrl]);

  const prevKitIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    if (prevKitIdRef.current !== activeKitId) {
      prevKitIdRef.current = activeKitId;
      savedSnapshotRef.current = computeSnapshot();
    }
  }, [isLoaded, activeKitId, computeSnapshot]);

  const isDirty = isLoaded && computeSnapshot() !== savedSnapshotRef.current;

  useEffect(() => { logoCleanupRef.current = logo; }, [logo]);
  useEffect(() => {
    return () => { if (logoCleanupRef.current) URL.revokeObjectURL(logoCleanupRef.current.previewUrl); };
  }, []);

  const loadKitData = useCallback((kit: BrandKitRow) => {
    setActiveKitId(kit.id);
    setKitName(kit.name);
    setBrand(kit.brand ? { ...INITIAL_BRAND, ...kit.brand } : INITIAL_BRAND);
    setPromptConfig(kit.promptConfig ? { systemPrompt: "", customInstructions: "", ...kit.promptConfig } : { systemPrompt: "", customInstructions: "" });
    if (kit.logoUrl) {
      setLogo({ id: "saved-logo", name: "Logo", mediaType: "image", previewUrl: kit.logoUrl, storageUrl: kit.logoUrl, status: "uploaded" });
    } else {
      setLogo(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setIsLoaded(false);
    setKits([]);
    setActiveKitId(null);
    setKitName("New Kit");
    setBrand(INITIAL_BRAND);
    setPromptConfig({ systemPrompt: "", customInstructions: "" });
    setLogo(null);
    const loadAll = async () => {
      try {
        const kitsRes = await fetch("/api/brand-kits", { cache: "no-store" });
        let loadedKits: BrandKitRow[] = [];
        if (kitsRes.ok) {
          const kitsJson = await kitsRes.json();
          loadedKits = kitsJson.kits ?? [];
        }
        setKits(loadedKits);
        if (loadedKits.length > 0) {
          const defaultKit = loadedKits.find((k) => k.isDefault) ?? loadedKits[0];
          loadKitData(defaultKit);
        }
      } catch { /* Brand kits may not be available */ }
      finally { setIsLoaded(true); }
    };
    void loadAll();
  }, [open, loadKitData]);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, promptConfig, logoUrl: logo?.storageUrl }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      if (activeKitId) {
        const kitRes = await fetch(`/api/brand-kits/${activeKitId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: kitName, brand, promptConfig, logoUrl: logo?.storageUrl }),
        });
        if (!kitRes.ok) throw new Error(await parseApiError(kitRes));
          const updatedKit = await kitRes.json();
          setKits((prev) => prev.map((k) => (k.id === activeKitId ? updatedKit : k)));
      }
      savedSnapshotRef.current = computeSnapshot();
      toast.success("Brand kit saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Could not save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadFileToStorage = async (file: File, folder: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    const response = await fetch("/api/assets/upload", { method: "POST", body: formData });
    if (!response.ok) throw new Error(await parseApiError(response));
    const json = (await response.json()) as { url?: string };
    if (!json.url) throw new Error("Storage did not return a URL");
    return json.url;
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const nextLogo: LocalAsset = { id: `${Date.now()}-${file.name}`, name: file.name, mediaType: "image", previewUrl: URL.createObjectURL(file), status: "uploading" };
    setLogo((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return nextLogo; });
    try {
      const url = await uploadFileToStorage(file, "logos");
      setLogo((current) => current ? { ...current, status: "uploaded", storageUrl: url } : null);
      toast.success("Logo uploaded.");
    } catch (uploadError) {
      setLogo((current) => current ? { ...current, status: "local", error: uploadError instanceof Error ? uploadError.message : "Upload failed" } : null);
      toast.error("Logo upload failed.");
    }
  };

  const autofillBrandFromWebsite = useCallback(
    async (websiteInput?: string) => {
      const rawWebsite = (websiteInput ?? brand.website).trim();
      if (!rawWebsite) return;
      setIsAutofillingBrand(true);
      try {
        const response = await fetch("/api/brand/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website: rawWebsite }),
        });
        if (!response.ok) throw new Error(await parseApiError(response));
        const json = (await response.json()) as { source?: "model" | "heuristic"; website?: string; brand?: Partial<BrandState> };
        if (!json.brand) throw new Error("No brand fields returned");
        const resolvedWebsite = (json.website || rawWebsite).trim();
        const normalizedKey = resolvedWebsite.toLowerCase();
        setBrand((current) => ({ ...current, ...json.brand, website: resolvedWebsite }));
        setLastAutofilledWebsite(normalizedKey);
        toast.success(json.source === "model" ? "Brand fields autofilled from website style + messaging." : "Brand fields autofilled using website metadata heuristics.");
      } catch (autofillError) {
        toast.error(autofillError instanceof Error ? autofillError.message : "Could not autofill brand fields from website");
      } finally {
        setIsAutofillingBrand(false);
      }
    },
    [brand.website],
  );

  const createNewKit = async () => {
    if (isCreatingKit) return;
    setIsCreatingKit(true);
    try {
      const res = await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Kit" }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const json = await res.json();
      setKits((prev) => [json.kit, ...prev]);
      loadKitData(json.kit);
      toast.success("New kit created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create kit");
    } finally {
      setIsCreatingKit(false);
    }
  };

  const deleteActiveKit = async () => {
    if (!activeKitId || kits.length <= 1) return;
    try {
      const res = await fetch(`/api/brand-kits/${activeKitId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const remaining = kits.filter((k) => k.id !== activeKitId);
      setKits(remaining);
      if (remaining.length > 0) loadKitData(remaining[0]);
      toast.success("Kit deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete kit");
    }
  };

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    modalRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Brand Kits" tabIndex={-1} className="fixed inset-0 z-[70] flex flex-col bg-[radial-gradient(circle_at_0%_0%,#1E293B_0%,#0F172A_35%,#020617_100%)] text-white outline-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-slate-300 hover:text-white" aria-label="Back to Settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-white">Brand Kits</h1>
        </div>
        <Button onClick={() => void saveSettings()} disabled={isSaving || !isDirty || !activeKitId}>
          {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Master/Detail layout */}
      {!isLoaded ? (
        <div className="flex-1 p-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Master — kit list (left sidebar) */}
          <div className="flex w-64 shrink-0 flex-col border-r border-white/10 max-md:w-48">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Kits</span>
              <Button variant="ghost" size="icon-sm" onClick={() => void createNewKit()} disabled={isCreatingKit} className="text-slate-400 hover:text-white" aria-label="New kit">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {kits.map((kit) => (
                  <button
                    key={kit.id}
                    type="button"
                    onClick={() => loadKitData(kit)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition",
                      kit.id === activeKitId
                        ? "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Palette className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{kit.name}</span>
                    {kit.isDefault && <span className="ml-auto text-[10px] text-slate-500">default</span>}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Detail — kit editor (right) */}
          <ScrollArea className="flex-1">
            {!activeKitId ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-12 text-center">
                <Palette className="h-10 w-10 text-slate-500" />
                <div>
                  <p className="text-lg font-semibold text-slate-200">No brand kits yet</p>
                  <p className="mt-1 text-sm text-slate-400">Create a kit to define your brand identity, colors, and prompt controls.</p>
                </div>
                <Button onClick={() => void createNewKit()} disabled={isCreatingKit}>
                  {isCreatingKit ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isCreatingKit ? "Creating..." : "Create Kit"}
                </Button>
              </div>
            ) : (
            <div className="mx-auto max-w-3xl space-y-6 p-6">
              {/* Kit name + delete */}
              <div className="flex items-center gap-3">
                <Input
                  value={kitName}
                  onChange={(e) => setKitName(e.target.value)}
                  className="max-w-xs text-lg font-semibold"
                  placeholder="Kit name"
                />
                {kits.length > 1 && activeKitId && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => void deleteActiveKit()}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
              </div>

              {/* Brand Identity */}
              <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                  <Palette className="h-4 w-4 text-orange-300" />
                  Brand Identity
                </div>

                {/* Logo */}
                <div className="mb-5">
                  <Label className="mb-1.5 block">Logo</Label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/30 bg-white/5 p-4 text-xs font-medium text-slate-200 transition hover:border-orange-300">
                    {logo ? (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo.previewUrl} alt="Logo preview" className="h-16 max-w-[10rem] object-contain" />
                        <div className="text-left">
                          <span className={cn("rounded-full border px-3 py-1 text-[11px] font-medium", statusChip(logo.status))}>
                            {logo.name === "Logo" ? "Logo ready" : logo.name}
                            {logo.status === "uploading" ? " (syncing)" : ""}
                          </span>
                          <p className="mt-1 text-[11px] text-slate-400">Click to replace</p>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <ImagePlus className="h-4 w-4 text-orange-300" />
                        Attach logo
                      </span>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleLogoUpload(event)} />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="brand-name">Brand Name</Label>
                    <Input id="brand-name" value={brand.brandName} onChange={(event) => setBrand((current) => ({ ...current, brandName: event.target.value }))} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="brand-website">Website (optional)</Label>
                    <Input
                      id="brand-website"
                      value={brand.website}
                      placeholder="example.com or https://example.com"
                      onChange={(event) => setBrand((current) => ({ ...current, website: event.target.value }))}
                      onBlur={(event) => {
                        const nextWebsite = event.target.value.trim().toLowerCase();
                        if (!nextWebsite || nextWebsite === lastAutofilledWebsite || isAutofillingBrand) return;
                        void autofillBrandFromWebsite(event.target.value);
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] text-slate-400">Providing a website can autofill brand fields and improve style alignment.</p>
                      <Button variant="outline" size="xs" onClick={() => void autofillBrandFromWebsite()} disabled={!brand.website.trim() || isAutofillingBrand}>
                        {isAutofillingBrand ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {isAutofillingBrand ? "Filling..." : "Autofill Brand Fields"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="brand-values">Values</Label>
                    <Textarea id="brand-values" value={brand.values} onChange={(event) => setBrand((current) => ({ ...current, values: event.target.value }))} rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="brand-principles">Principles</Label>
                    <Textarea id="brand-principles" value={brand.principles} onChange={(event) => setBrand((current) => ({ ...current, principles: event.target.value }))} rows={3} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="brand-story">Story</Label>
                    <Textarea id="brand-story" value={brand.story} onChange={(event) => setBrand((current) => ({ ...current, story: event.target.value }))} rows={3} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="brand-voice">Voice</Label>
                    <Textarea id="brand-voice" value={brand.voice} onChange={(event) => setBrand((current) => ({ ...current, voice: event.target.value }))} rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="brand-visual">Visual Direction</Label>
                    <Textarea id="brand-visual" value={brand.visualDirection} onChange={(event) => setBrand((current) => ({ ...current, visualDirection: event.target.value }))} rows={2} />
                  </div>

                  {/* Color Palette Picker */}
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Palette</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const colors = brand.palette.split(",").map((c) => c.trim()).filter(Boolean);
                        return colors.map((hex, i) => (
                          <div key={i} className="group relative">
                            <button type="button" className="h-9 w-9 rounded-lg border border-white/20 transition hover:scale-110" style={{ backgroundColor: hex }} onClick={() => { const picker = document.getElementById(`color-picker-${i}`) as HTMLInputElement; picker?.click(); }} aria-label={`Color ${hex}`} />
                            <input id={`color-picker-${i}`} type="color" value={hex.startsWith("#") ? hex : `#${hex}`} className="invisible absolute inset-0 h-0 w-0" onChange={(e) => { const updated = [...colors]; updated[i] = e.target.value; setBrand((current) => ({ ...current, palette: updated.join(", ") })); }} />
                            <button type="button" className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex" onClick={() => { const updated = colors.filter((_, j) => j !== i); setBrand((current) => ({ ...current, palette: updated.join(", ") })); }} aria-label="Remove color">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ));
                      })()}
                      <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-white/30 text-slate-400 transition hover:border-orange-300 hover:text-orange-300" onClick={() => setBrand((current) => ({ ...current, palette: current.palette ? `${current.palette}, #888888` : "#888888" }))} aria-label="Add color">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">Click a swatch to pick a color. Click + to add.</p>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="brand-fonts">Fonts</Label>
                    <Input id="brand-fonts" value={brand.fonts} placeholder="e.g. Inter, Playfair Display" onChange={(event) => setBrand((current) => ({ ...current, fonts: event.target.value }))} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="brand-logo-notes">Logo Notes</Label>
                    <Input id="brand-logo-notes" value={brand.logoNotes} onChange={(event) => setBrand((current) => ({ ...current, logoNotes: event.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Prompt Controls */}
              <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">Prompt Controls</p>
                  <Button variant="outline" size="xs" onClick={() => setPromptConfig({ systemPrompt: "", customInstructions: "" })}>Reset</Button>
                </div>
                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="system-prompt" className="text-[11px] text-slate-300">System Prompt Addendum (optional)</Label>
                    <Textarea id="system-prompt" value={promptConfig.systemPrompt} onChange={(event) => setPromptConfig((current) => ({ ...current, systemPrompt: event.target.value }))} rows={3} placeholder="Add global behavior rules, voice guardrails, or hard constraints." className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="custom-instructions" className="text-[11px] text-slate-300">Campaign Instructions (optional)</Label>
                    <Textarea id="custom-instructions" value={promptConfig.customInstructions} onChange={(event) => setPromptConfig((current) => ({ ...current, customInstructions: event.target.value }))} rows={3} placeholder="Example: prioritize educational carousel angle for saves and shares." className="text-xs" />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  The default system prompt remains active automatically: {DEFAULT_GENERATION_SYSTEM_PROMPT}
                </p>
              </div>
            </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
