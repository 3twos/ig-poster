"use client";

import {
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

import { AppShell } from "@/components/app-shell";
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

export default function BrandPage() {
  const [brand, setBrand] = useState<BrandState>(INITIAL_BRAND);
  const [logo, setLogo] = useState<LocalAsset | null>(null);
  const [promptConfig, setPromptConfig] = useState<PromptConfigState>({
    systemPrompt: "",
    customInstructions: "",
  });

  const [isAutofillingBrand, setIsAutofillingBrand] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastAutofilledWebsite, setLastAutofilledWebsite] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const savedSnapshotRef = useRef<string>("");

  // Multi-kit state
  const [kits, setKits] = useState<BrandKitRow[]>([]);
  const [activeKitId, setActiveKitId] = useState<string | null>(null);
  const [kitName, setKitName] = useState("Default");

  const logoCleanupRef = useRef<LocalAsset | null>(null);

  const computeSnapshot = useCallback(() => {
    return JSON.stringify({ brand, promptConfig, logoUrl: logo?.storageUrl });
  }, [brand, promptConfig, logo?.storageUrl]);

  // Reset snapshot whenever the active kit changes or settings finish loading
  // This runs after React state updates from loadKitData have been applied
  const prevKitIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    // Reset snapshot on initial load or when switching kits
    if (prevKitIdRef.current !== activeKitId) {
      prevKitIdRef.current = activeKitId;
      savedSnapshotRef.current = computeSnapshot();
    }
  }, [isLoaded, activeKitId, computeSnapshot]);

  const isDirty = isLoaded && computeSnapshot() !== savedSnapshotRef.current;

  useEffect(() => {
    logoCleanupRef.current = logo;
  }, [logo]);

  useEffect(() => {
    return () => {
      if (logoCleanupRef.current) {
        URL.revokeObjectURL(logoCleanupRef.current.previewUrl);
      }
    };
  }, []);

  const loadKitData = useCallback((kit: BrandKitRow) => {
    setActiveKitId(kit.id);
    setKitName(kit.name);
    if (kit.brand) setBrand((current) => ({ ...current, ...kit.brand }));
    if (kit.promptConfig) setPromptConfig((current) => ({ ...current, ...kit.promptConfig }));
    if (kit.logoUrl) {
      setLogo({ id: "saved-logo", name: "Saved logo", mediaType: "image", previewUrl: kit.logoUrl, storageUrl: kit.logoUrl, status: "uploaded" });
    } else {
      setLogo(null);
    }
  }, []);

  // Load kits and settings on mount
  useEffect(() => {
    const loadAll = async () => {
      try {
        // Load kits first
        const kitsRes = await fetch("/api/brand-kits", { cache: "no-store" });
        let loadedKits: BrandKitRow[] = [];
        if (kitsRes.ok) {
          const kitsJson = await kitsRes.json();
          loadedKits = kitsJson.kits ?? [];
        }

        if (loadedKits.length > 0) {
          setKits(loadedKits);
          // Load the default kit, or the first one
          const defaultKit = loadedKits.find((k) => k.isDefault) ?? loadedKits[0];
          loadKitData(defaultKit);
        } else {
          // No kits exist — fall back to settings and auto-create a kit
          const response = await fetch("/api/settings", { cache: "no-store" });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let settingsJson: any = null;
          if (response.ok) {
            settingsJson = await response.json();
            if (settingsJson?.brand) setBrand((current) => ({ ...current, ...settingsJson.brand }));
            if (settingsJson?.promptConfig) setPromptConfig((current) => ({ ...current, ...settingsJson.promptConfig }));
            if (settingsJson?.logoUrl) {
              setLogo({ id: "saved-logo", name: "Saved logo", mediaType: "image", previewUrl: settingsJson.logoUrl, storageUrl: settingsJson.logoUrl, status: "uploaded" });
            }
          }

          // Auto-create "Default" kit from loaded settings (not stale React state)
          const loadedBrand = settingsJson?.brand ? { ...INITIAL_BRAND, ...settingsJson.brand } : brand;
          const loadedPromptConfig = settingsJson?.promptConfig ? { ...promptConfig, ...settingsJson.promptConfig } : promptConfig;
          const loadedLogoUrl = settingsJson?.logoUrl ?? logo?.storageUrl;
          try {
            const createRes = await fetch("/api/brand-kits", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Default", brand: loadedBrand, promptConfig: loadedPromptConfig, logoUrl: loadedLogoUrl, isDefault: true }),
            });
            if (createRes.ok) {
              const createJson = await createRes.json();
              setKits([createJson.kit]);
              setActiveKitId(createJson.kit.id);
              setKitName("Default");
            }
          } catch {
            // Best effort — page still works without a kit row
          }
        }
      } catch {
        // Settings may not be available
      } finally {
        setIsLoaded(true);
      }
    };

    void loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = async () => {
    setIsSaving(true);

    try {
      // Save to global settings (backwards compat)
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          promptConfig,
          logoUrl: logo?.storageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      // Also save to the active brand kit row
      if (activeKitId) {
        const kitRes = await fetch(`/api/brand-kits/${activeKitId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: kitName,
            brand,
            promptConfig,
            logoUrl: logo?.storageUrl,
          }),
        });
        if (kitRes.ok) {
          const updatedKit = await kitRes.json();
          setKits((prev) => prev.map((k) => (k.id === activeKitId ? updatedKit : k)));
        }
      }

      savedSnapshotRef.current = computeSnapshot();
      toast.success("Brand kit saved.");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Could not save settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

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

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

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
      toast.success("Logo uploaded.");
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
      toast.error("Logo upload failed.");
    }
  };

  const autofillBrandFromWebsite = useCallback(
    async (websiteInput?: string) => {
      const rawWebsite = (websiteInput ?? brand.website).trim();
      if (!rawWebsite) {
        return;
      }

      setIsAutofillingBrand(true);

      try {
        const response = await fetch("/api/brand/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website: rawWebsite }),
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const json = (await response.json()) as {
          source?: "model" | "heuristic";
          website?: string;
          brand?: Partial<BrandState>;
        };

        if (!json.brand) {
          throw new Error("No brand fields returned");
        }

        const resolvedWebsite = (json.website || rawWebsite).trim();
        const normalizedKey = resolvedWebsite.toLowerCase();
        setBrand((current) => ({
          ...current,
          ...json.brand,
          website: resolvedWebsite,
        }));
        setLastAutofilledWebsite(normalizedKey);
        toast.success(
          json.source === "model"
            ? "Brand fields autofilled from website style + messaging."
            : "Brand fields autofilled using website metadata heuristics.",
        );
      } catch (autofillError) {
        toast.error(
          autofillError instanceof Error
            ? autofillError.message
            : "Could not autofill brand fields from website",
        );
      } finally {
        setIsAutofillingBrand(false);
      }
    },
    [brand.website],
  );

  if (!isLoaded) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-36" />
          </div>
          <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 md:p-6">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-white">Brand Kit</h1>
          <Button
            onClick={() => {
              void saveSettings();
            }}
            disabled={isSaving || !isDirty}
          >
            {isSaving ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Kit selector */}
        {kits.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              value={activeKitId ?? ""}
              onValueChange={(id) => {
                const kit = kits.find((k) => k.id === id);
                if (kit) {
                  loadKitData(kit);
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select kit" />
              </SelectTrigger>
              <SelectContent>
                {kits.map((kit) => (
                  <SelectItem key={kit.id} value={kit.id}>
                    {kit.name}{kit.isDefault ? " (Default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={kitName}
              onChange={(e) => setKitName(e.target.value)}
              className="w-[160px]"
              placeholder="Kit name"
            />
            <Button
              variant="outline"
              size="xs"
              onClick={async () => {
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
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Kit
            </Button>
            {kits.length > 1 && activeKitId && (
              <Button
                variant="outline"
                size="xs"
                onClick={async () => {
                  if (!activeKitId) return;
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
                }}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Palette className="h-4 w-4 text-orange-300" />
            Brand Identity
          </div>

          {/* Logo — first field */}
          <div className="mb-5">
            <Label className="mb-1.5 block">Logo</Label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/30 bg-white/5 p-4 text-xs font-medium text-slate-200 transition hover:border-orange-300">
              {logo ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.previewUrl}
                    alt="Logo preview"
                    className="h-16 max-w-[10rem] object-contain"
                  />
                  <div className="text-left">
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-medium",
                        statusChip(logo.status),
                      )}
                    >
                      {logo.name}
                      {logo.status === "uploading" ? " (syncing)" : ""}
                    </span>
                    <p className="mt-1 text-[11px] text-slate-400">Click to replace</p>
                  </div>
                </div>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <ImagePlus className="h-4 w-4 text-orange-300" />
                  Upload Logo
                </span>
              )}
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

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="brand-name">Brand Name</Label>
              <Input
                id="brand-name"
                value={brand.brandName}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    brandName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="brand-website">Website (optional)</Label>
              <Input
                id="brand-website"
                value={brand.website}
                placeholder="example.com or https://example.com"
                onChange={(event) => {
                  const nextWebsite = event.target.value;
                  setBrand((current) => ({
                    ...current,
                    website: nextWebsite,
                  }));
                }}
                onBlur={(event) => {
                  const nextWebsite = event.target.value.trim().toLowerCase();
                  if (
                    !nextWebsite ||
                    nextWebsite === lastAutofilledWebsite ||
                    isAutofillingBrand
                  ) {
                    return;
                  }

                  void autofillBrandFromWebsite(event.target.value);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-slate-400">
                  Providing a website can autofill brand fields and improve style
                  alignment.
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    void autofillBrandFromWebsite();
                  }}
                  disabled={!brand.website.trim() || isAutofillingBrand}
                >
                  {isAutofillingBrand ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {isAutofillingBrand ? "Filling..." : "Autofill Brand Fields"}
                </Button>
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="brand-values">Values</Label>
              <Textarea
                id="brand-values"
                value={brand.values}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    values: event.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-principles">Principles</Label>
              <Textarea
                id="brand-principles"
                value={brand.principles}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    principles: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-story">Story</Label>
              <Textarea
                id="brand-story"
                value={brand.story}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    story: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-voice">Voice</Label>
              <Textarea
                id="brand-voice"
                value={brand.voice}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    voice: event.target.value,
                  }))
                }
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="brand-visual">Visual Direction</Label>
              <Textarea
                id="brand-visual"
                value={brand.visualDirection}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    visualDirection: event.target.value,
                  }))
                }
                rows={2}
              />
            </div>

            {/* Color Palette Picker */}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Palette</Label>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const colors = brand.palette
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean);
                  return colors.map((hex, i) => (
                    <div key={i} className="group relative">
                      <button
                        type="button"
                        className="h-9 w-9 rounded-lg border border-white/20 transition hover:scale-110"
                        style={{ backgroundColor: hex }}
                        onClick={() => {
                          const picker = document.getElementById(`color-picker-${i}`) as HTMLInputElement;
                          picker?.click();
                        }}
                        aria-label={`Color ${hex}`}
                      />
                      <input
                        id={`color-picker-${i}`}
                        type="color"
                        value={hex.startsWith("#") ? hex : `#${hex}`}
                        className="invisible absolute inset-0 h-0 w-0"
                        onChange={(e) => {
                          const updated = [...colors];
                          updated[i] = e.target.value;
                          setBrand((current) => ({
                            ...current,
                            palette: updated.join(", "),
                          }));
                        }}
                      />
                      <button
                        type="button"
                        className="absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                        onClick={() => {
                          const updated = colors.filter((_, j) => j !== i);
                          setBrand((current) => ({
                            ...current,
                            palette: updated.join(", "),
                          }));
                        }}
                        aria-label="Remove color"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ));
                })()}
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-white/30 text-slate-400 transition hover:border-orange-300 hover:text-orange-300"
                  onClick={() => {
                    setBrand((current) => ({
                      ...current,
                      palette: current.palette
                        ? `${current.palette}, #888888`
                        : "#888888",
                    }));
                  }}
                  aria-label="Add color"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Click a swatch to pick a color. Click + to add.</p>
            </div>

            {/* Fonts */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="brand-fonts">Fonts</Label>
              <Input
                id="brand-fonts"
                value={brand.fonts}
                placeholder="e.g. Inter, Playfair Display"
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    fonts: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="brand-logo-notes">Logo Notes</Label>
              <Input
                id="brand-logo-notes"
                value={brand.logoNotes}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    logoNotes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Prompt Controls</p>
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                setPromptConfig({
                  systemPrompt: "",
                  customInstructions: "",
                })
              }
            >
              Reset
            </Button>
          </div>

          <div className="grid gap-2">
            <div className="space-y-1">
              <Label htmlFor="system-prompt" className="text-[11px] text-slate-300">
                System Prompt Addendum (optional)
              </Label>
              <Textarea
                id="system-prompt"
                value={promptConfig.systemPrompt}
                onChange={(event) =>
                  setPromptConfig((current) => ({
                    ...current,
                    systemPrompt: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Add global behavior rules, voice guardrails, or hard constraints."
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="custom-instructions" className="text-[11px] text-slate-300">
                Campaign Instructions (optional)
              </Label>
              <Textarea
                id="custom-instructions"
                value={promptConfig.customInstructions}
                onChange={(event) =>
                  setPromptConfig((current) => ({
                    ...current,
                    customInstructions: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Example: prioritize educational carousel angle for saves and shares."
                className="text-xs"
              />
            </div>
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            The default system prompt remains active automatically:{" "}
            {DEFAULT_GENERATION_SYSTEM_PROMPT}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
