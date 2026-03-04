"use client";

import {
  ImagePlus,
  LoaderCircle,
  Palette,
  Save,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { AppShell } from "@/components/app-shell";
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brandAutofillMessage, setBrandAutofillMessage] = useState<
    string | null
  >(null);
  const [lastAutofilledWebsite, setLastAutofilledWebsite] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  const logoCleanupRef = useRef<LocalAsset | null>(null);

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

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) {
          setIsLoaded(true);
          return;
        }

        const json = await response.json();
        if (json?.brand) {
          setBrand((current) => ({ ...current, ...json.brand }));
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
        // Settings may not be available
      } finally {
        setIsLoaded(true);
      }
    };

    void loadSettings();
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
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

      setSaveMessage("Brand kit saved.");
      window.setTimeout(() => setSaveMessage(null), 3000);
    } catch (saveError) {
      setError(
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

    setError(null);

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

    // Logo upload status tracked via logo.status

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
      // done
    }
  };

  const autofillBrandFromWebsite = useCallback(
    async (websiteInput?: string) => {
      const rawWebsite = (websiteInput ?? brand.website).trim();
      if (!rawWebsite) {
        return;
      }

      setError(null);
      setBrandAutofillMessage(null);
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
        setBrandAutofillMessage(
          json.source === "model"
            ? "Brand fields autofilled from website style + messaging."
            : "Brand fields autofilled using website metadata heuristics.",
        );
      } catch (autofillError) {
        setError(
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
        <div className="flex items-center justify-center py-20">
          <LoaderCircle className="h-6 w-6 animate-spin text-orange-300" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-white">Brand Kit</h1>
          <button
            type="button"
            onClick={() => {
              void saveSettings();
            }}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Saving..." : "Save Brand Kit"}
          </button>
        </div>

        {saveMessage ? (
          <p className="text-xs text-emerald-200">{saveMessage}</p>
        ) : null}
        {error ? (
          <p className="text-xs font-medium text-red-300">{error}</p>
        ) : null}

        <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Palette className="h-4 w-4 text-orange-300" />
            Brand Identity
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-200">
                Brand Name
              </span>
              <input
                value={brand.brandName}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    brandName: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-200">
                Website (optional)
              </span>
              <input
                value={brand.website}
                placeholder="example.com or https://example.com"
                onChange={(event) => {
                  const nextWebsite = event.target.value;
                  if (
                    nextWebsite.trim().toLowerCase() !== lastAutofilledWebsite
                  ) {
                    setBrandAutofillMessage(null);
                  }

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
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-slate-400">
                  Providing a website can autofill brand fields and improve style
                  alignment.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void autofillBrandFromWebsite();
                  }}
                  disabled={!brand.website.trim() || isAutofillingBrand}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAutofillingBrand ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {isAutofillingBrand ? "Filling..." : "Autofill Brand Fields"}
                </button>
              </div>
              {brandAutofillMessage ? (
                <p className="text-[11px] text-emerald-200">
                  {brandAutofillMessage}
                </p>
              ) : null}
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-200">Values</span>
              <textarea
                value={brand.values}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    values: event.target.value,
                  }))
                }
                rows={2}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">
                Principles
              </span>
              <textarea
                value={brand.principles}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    principles: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">Story</span>
              <textarea
                value={brand.story}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    story: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">Voice</span>
              <textarea
                value={brand.voice}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    voice: event.target.value,
                  }))
                }
                rows={2}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">
                Visual Direction
              </span>
              <textarea
                value={brand.visualDirection}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    visualDirection: event.target.value,
                  }))
                }
                rows={2}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-200">
                Palette (hex list)
              </span>
              <input
                value={brand.palette}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    palette: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-slate-200">
                Logo Notes
              </span>
              <input
                value={brand.logoNotes}
                onChange={(event) =>
                  setBrand((current) => ({
                    ...current,
                    logoNotes: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none transition focus:border-orange-300"
              />
            </label>
          </div>

          <div className="mt-5">
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
            {logo ? (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logo.previewUrl}
                  alt="Logo preview"
                  className="h-10 max-w-[6rem] object-contain"
                />
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] font-medium",
                    statusChip(logo.status),
                  )}
                >
                  {logo.name}
                  {logo.status === "uploading" ? " (syncing)" : ""}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/15 bg-slate-900/55 p-5 backdrop-blur-xl md:p-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Prompt Controls</p>
            <button
              type="button"
              onClick={() =>
                setPromptConfig({
                  systemPrompt: "",
                  customInstructions: "",
                })
              }
              className="rounded-lg border border-white/25 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10"
            >
              Reset
            </button>
          </div>

          <div className="grid gap-2">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-300">
                System Prompt Addendum (optional)
              </span>
              <textarea
                value={promptConfig.systemPrompt}
                onChange={(event) =>
                  setPromptConfig((current) => ({
                    ...current,
                    systemPrompt: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Add global behavior rules, voice guardrails, or hard constraints."
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs outline-none transition focus:border-orange-300"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-slate-300">
                Campaign Instructions (optional)
              </span>
              <textarea
                value={promptConfig.customInstructions}
                onChange={(event) =>
                  setPromptConfig((current) => ({
                    ...current,
                    customInstructions: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Example: prioritize educational carousel angle for saves and shares."
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs outline-none transition focus:border-orange-300"
              />
            </label>
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
