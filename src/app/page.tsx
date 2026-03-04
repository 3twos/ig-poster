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
  Send,
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
import { cn, slugify } from "@/lib/utils";

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
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
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

  const posterRef = useRef<HTMLDivElement>(null);
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
    };
  }, []);

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
    setGenerationStatus("validating");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      // Check if the response is an SSE stream
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalResult: GenerationResponse | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const event = JSON.parse(data) as {
                  type: string;
                  message?: string;
                  result?: unknown;
                };

                if (event.type === "status" && event.message) {
                  setGenerationStatus(event.message);
                } else if (event.type === "complete" && event.result) {
                  finalResult = GenerationResponseSchema.parse(event.result);
                } else if (event.type === "error" && event.message) {
                  throw new Error(event.message);
                }
              } catch (parseError) {
                if (parseError instanceof Error && parseError.message !== "Unexpected end of JSON input") {
                  throw parseError;
                }
              }
            }
          }
        }

        if (finalResult) {
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
        } else {
          throw new Error(
            "Generation stream ended without results. Please try again.",
          );
        }
      } else {
        // Standard JSON response (fallback)
        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }

        const parsed = GenerationResponseSchema.parse(await response.json());
        setResult(parsed);
        setActiveVariantId(parsed.variants[0]?.id ?? null);
        setOverlayLayouts(
          Object.fromEntries(
            parsed.variants.map((variant) => [
              variant.id,
              createDefaultOverlayLayout(variant.layout),
            ]),
          ),
        );
        setShareUrl(null);
      }
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Unexpected generation issue.",
      );
    } finally {
      setIsGenerating(false);
      setGenerationStatus(null);
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

  return (
    <AppShell>
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
                {isGenerating
                  ? generationStatus ?? "Generating..."
                  : "Generate SOTA Concepts"}
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
    </AppShell>
  );
}
