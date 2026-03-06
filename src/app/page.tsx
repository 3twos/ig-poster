"use client";

import { toPng } from "html-to-image";
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Square,
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

import { AgentActivityPanel } from "@/components/agent-activity-panel";
import { BrandKitModal } from "@/components/brand-kit-modal";
import { ChatPanel } from "@/components/chat";
import { AppShell } from "@/components/app-shell";
import { AssetManager } from "@/components/asset-manager";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PostBriefForm } from "@/components/post-brief-form";
import { PosterSection } from "@/components/poster-section";
import { MobileSidebarDrawer, SidebarContent } from "@/components/post-sidebar";
import { PublishSection } from "@/components/publish-section";
import { SettingsModal } from "@/components/settings-modal";
import { StrategySection } from "@/components/strategy-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePostContext } from "@/contexts/post-context";
import { useGeneration } from "@/hooks/use-generation";
import {
  createDefaultOverlayLayout,
  type GenerationResponse,
} from "@/lib/creative";
import { formatElapsed } from "@/lib/agent-types";
import {
  type BrandState,
  type InstagramAuthStatus,
  type LlmAuthStatus,
  type LocalAsset,
  type PostState,
  type PromptConfigState,
  INITIAL_BRAND,
  INITIAL_POST,
} from "@/lib/types";
import {
  extractVideoMetadata,
  mediaTypeFromFile,
  parseApiError,
  revokeObjectUrlIfNeeded,
} from "@/lib/upload-helpers";
import { withPerf } from "@/lib/perf";
import { cn, slugify } from "@/lib/utils";
import { toast } from "sonner";

export default function Home() {
  const {
    activePost,
    dispatch,
    createNewPost,
    selectPost,
  } = usePostContext();

  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([]);
  const [localLogo, setLocalLogo] = useState<LocalAsset | null>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const [shareCopyState, setShareCopyState] = useState<"idle" | "done">("idle");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [authStatus, setAuthStatus] = useState<InstagramAuthStatus>({ connected: false, source: null });
  const [llmAuthStatus, setLlmAuthStatus] = useState<LlmAuthStatus>({ connected: false, source: null });
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [mobileAgentSheetOpen, setMobileAgentSheetOpen] = useState(false);
  const [mobileChatSheetOpen, setMobileChatSheetOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"agent" | "chat">("agent");
  const [brandKitOptions, setBrandKitOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brandKitsOpen, setBrandKitsOpen] = useState(false);
  const [hydratedAssetsPostId, setHydratedAssetsPostId] = useState<string | null>(null);
  const [pendingGenerateRequest, setPendingGenerateRequest] = useState<{ postId: string } | null>(null);
  const [pendingPublishRequest, setPendingPublishRequest] = useState<{ postId: string; scheduleAt?: string } | null>(null);

  const posterRef = useRef<HTMLDivElement>(null);
  const activityPanelRef = useRef<HTMLDivElement>(null);
  const assetCleanupRef = useRef<LocalAsset[]>([]);
  const logoCleanupRef = useRef<LocalAsset | null>(null);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const brand: BrandState = useMemo(() => {
    if (!activePost?.brand) return INITIAL_BRAND;
    return { ...INITIAL_BRAND, ...activePost.brand } as BrandState;
  }, [activePost?.brand]);

  const post: PostState = useMemo(() => {
    if (!activePost?.brief) return INITIAL_POST;
    return { ...INITIAL_POST, ...activePost.brief } as PostState;
  }, [activePost?.brief]);

  const result: GenerationResponse | null = activePost?.result ?? null;
  const activeVariantId = activePost?.activeVariantId ?? null;
  const overlayLayouts = useMemo(() => activePost?.overlayLayouts ?? {}, [activePost?.overlayLayouts]);
  const activeSlideIndex = activePost?.activeSlideIndex ?? 0;
  const shareUrl = activePost?.shareUrl ?? null;
  const promptConfig: PromptConfigState = useMemo(
    () => ({
      systemPrompt: activePost?.promptConfig?.systemPrompt ?? "",
      customInstructions: activePost?.promptConfig?.customInstructions ?? "",
    }),
    [activePost?.promptConfig],
  );
  const localTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "local time",
    [],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedDispatch = dispatch as (action: any) => void;

  const generation = useGeneration({
    brand,
    post,
    localAssets,
    localLogo,
    promptConfig,
    dispatch: typedDispatch,
  });

  useEffect(() => {
    if (!activePost) {
      setLocalAssets([]);
      setLocalLogo(null);
      setHydratedAssetsPostId(null);
      return;
    }
    const hydrated: LocalAsset[] = (activePost.assets ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      mediaType: a.mediaType ?? "image",
      previewUrl: a.url,
      posterUrl: a.posterUrl,
      storageUrl: a.url,
      status: "uploaded" as const,
      durationSec: a.durationSec,
    }));
    setLocalAssets(hydrated);
    if (activePost.logoUrl) {
      setLocalLogo({ id: "saved-logo", name: "Logo", mediaType: "image", previewUrl: activePost.logoUrl, storageUrl: activePost.logoUrl, status: "uploaded" });
    } else {
      setLocalLogo(null);
    }
    setHydratedAssetsPostId(activePost.id);
    generation.setError(null);
    setPublishMessage(null);
    setEditorMode(false);
  }, [activePost?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncAssetsToPost = useCallback(
    (assets: LocalAsset[]) => {
      const stored = assets
        .filter((a) => a.status === "uploaded" && a.storageUrl)
        .map((a) => ({ id: a.id, name: a.name, url: a.storageUrl!, mediaType: a.mediaType, posterUrl: a.posterUrl, durationSec: a.durationSec }));
      dispatch({ type: "SET_ASSETS", assets: stored });
    },
    [dispatch],
  );

  useEffect(() => { assetCleanupRef.current = localAssets; }, [localAssets]);
  useEffect(() => { logoCleanupRef.current = localLogo; }, [localLogo]);
  useEffect(() => {
    return () => {
      assetCleanupRef.current.forEach((a) => {
        revokeObjectUrlIfNeeded(a.previewUrl);
        if (a.posterUrl) {
          revokeObjectUrlIfNeeded(a.posterUrl);
        }
      });
      if (logoCleanupRef.current) {
        revokeObjectUrlIfNeeded(logoCleanupRef.current.previewUrl);
      }
    };
  }, []);

  const loadAuthStatus = useCallback(async () => {
    setIsAuthLoading(true);
    try {
      const r = await fetch("/api/auth/meta/status", { cache: "no-store" });
      const j = (await r.json()) as InstagramAuthStatus;
      setAuthStatus({ connected: Boolean(j.connected), source: j.source ?? null, account: j.account, detail: j.detail });
    } catch { setAuthStatus({ connected: false, source: null, detail: "Could not load Instagram auth status." }); }
    finally { setIsAuthLoading(false); }
  }, []);

  const loadLlmStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/llm/status", { cache: "no-store" });
      const j = (await r.json()) as LlmAuthStatus;
      setLlmAuthStatus({ connected: Boolean(j.connected), source: j.source ?? null, provider: j.provider, model: j.model, detail: j.detail });
    } catch { setLlmAuthStatus({ connected: false, source: null, detail: "Could not load LLM provider status." }); }
  }, []);

  const loadBrandKits = useCallback(async () => {
    try {
      const r = await fetch("/api/brand-kits", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        const kits = (j.kits ?? []) as Array<{ id: string; name: string }>;
        setBrandKitOptions(kits.map((k) => ({ id: k.id, name: k.name })));
      }
    } catch { /* ignore */ }
  }, []);

  const handleSelectBrandKit = useCallback(async (kitId: string) => {
    try {
      const r = await fetch(`/api/brand-kits/${kitId}`, { cache: "no-store" });
      if (!r.ok) return;
      const kit = await r.json();
      dispatch({
        type: "SET_BRAND_KIT",
        brandKitId: kitId,
        brand: kit.brand ?? {},
        logoUrl: kit.logoUrl ?? null,
        promptConfig: kit.promptConfig ?? null,
      });
      if (kit.logoUrl) {
        setLocalLogo({ id: "kit-logo", name: "Logo", mediaType: "image", previewUrl: kit.logoUrl, storageUrl: kit.logoUrl, status: "uploaded" });
      } else {
        setLocalLogo(null);
      }
    } catch { /* ignore */ }
  }, [dispatch]);

  useEffect(() => {
    void loadAuthStatus();
    void loadLlmStatus();
    void loadBrandKits();
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    const detail = params.get("detail");
    if (auth === "connected") { setPublishMessage("Instagram account connected."); toast.success("Instagram account connected."); }
    if (auth === "error" && detail) { const s = detail.slice(0, 200).replace(/[<>"']/g, ""); generation.setError(s); toast.error(s); }
    if (auth) { params.delete("auth"); params.delete("detail"); const n = params.toString(); window.history.replaceState({}, "", n ? `${window.location.pathname}?${n}` : window.location.pathname); }
  }, [loadAuthStatus, loadLlmStatus, loadBrandKits]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeVariant = useMemo(() => {
    if (!result?.variants.length) return null;
    return result.variants.find((v) => v.id === activeVariantId) ?? result.variants[0];
  }, [activeVariantId, result]);

  useEffect(() => { dispatch({ type: "SET_ACTIVE_SLIDE", index: 0 }); }, [activeVariantId, dispatch]);

  const activeOverlayLayout = useMemo(() => {
    if (!activeVariant) return undefined;
    return overlayLayouts[activeVariant.id] ?? createDefaultOverlayLayout(activeVariant.layout);
  }, [activeVariant, overlayLayouts]);

  const assetMap = useMemo(() => new Map(localAssets.map((a) => [a.id, a])), [localAssets]);

  const orderedVariantAssets = useMemo(() => {
    if (!activeVariant) return localAssets;
    const ordered = activeVariant.assetSequence.map((id) => assetMap.get(id)).filter((a): a is LocalAsset => Boolean(a));
    if (!ordered.length) return localAssets;
    const used = new Set(ordered.map((a) => a.id));
    return [...ordered, ...localAssets.filter((a) => !used.has(a.id))];
  }, [activeVariant, assetMap, localAssets]);

  const getDisplayVisual = (asset?: LocalAsset) => {
    if (!asset) return undefined;
    return asset.mediaType === "video" ? (asset.posterUrl || undefined) : asset.previewUrl;
  };

  const primaryVisualIndex = activeVariant?.postType === "carousel" ? activeSlideIndex : 0;
  const primaryVisual = getDisplayVisual(orderedVariantAssets[primaryVisualIndex]);
  const secondaryVisual = getDisplayVisual(orderedVariantAssets[1]);

  const isAgentBusy = generation.isGenerating || isUploadingAssets || isSharing || isPublishing || isRefining;
  const canRetryGeneration = !generation.isGenerating && localAssets.length > 0 && !isUploadingAssets;

  const statusLine = useMemo(() => {
    if (generation.agentRun?.status === "running") {
      const activeStep = generation.agentRun.steps.find((s) => s.status === "active") ?? generation.agentRun.steps[generation.agentRun.steps.length - 1];
      const activeIndex = activeStep ? generation.agentRun.steps.findIndex((s) => s.id === activeStep.id) + 1 : 1;
      return { tone: "active" as const, text: `${activeStep?.title ?? "Generating concepts"} · Step ${Math.max(activeIndex, 1)}/${Math.max(generation.agentRun.steps.length, 1)}${generation.agentRun.heartbeat ? ` · ${generation.agentRun.heartbeat}` : ""}`, elapsedMs: generation.runClock - generation.agentRun.startedAt, showStop: true };
    }
    if (generation.isGenerating) return { tone: "active" as const, text: "Preparing generation request...", elapsedMs: undefined, showStop: true };
    if (isUploadingAssets) return { tone: "active" as const, text: "Uploading assets...", elapsedMs: undefined, showStop: false };
    if (isSharing) return { tone: "active" as const, text: "Creating share link...", elapsedMs: undefined, showStop: false };
    if (isPublishing) return { tone: "active" as const, text: "Publishing to Instagram...", elapsedMs: undefined, showStop: false };
    if (isRefining) return { tone: "active" as const, text: "Refining selected variant...", elapsedMs: undefined, showStop: false };
    if (generation.error) return { tone: "error" as const, text: generation.error, elapsedMs: undefined, showStop: false };
    if (generation.agentRun?.status === "success") return { tone: "success" as const, text: generation.agentRun.summary ?? "Concept generation complete.", elapsedMs: typeof generation.agentRun.endedAt === "number" ? generation.agentRun.endedAt - generation.agentRun.startedAt : undefined, showStop: false };
    if (generation.agentRun?.status === "cancelled") return { tone: "error" as const, text: generation.agentRun.summary ?? "Generation stopped.", elapsedMs: typeof generation.agentRun.endedAt === "number" ? generation.agentRun.endedAt - generation.agentRun.startedAt : undefined, showStop: false };
    if (publishMessage) return { tone: "success" as const, text: publishMessage, elapsedMs: undefined, showStop: false };
    if (shareUrl) return { tone: "success" as const, text: "Share link created.", elapsedMs: undefined, showStop: false };
    return { tone: "idle" as const, text: "Ready. Upload assets and generate concepts.", elapsedMs: undefined, showStop: false };
  }, [generation.agentRun, generation.error, generation.isGenerating, generation.runClock, isPublishing, isRefining, isSharing, isUploadingAssets, publishMessage, shareUrl]);

  const uploadFileToStorage = async (file: File, folder: string) => {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", folder);
    const r = await fetch("/api/assets/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error(await parseApiError(r));
    const j = (await r.json()) as { url?: string };
    if (!j.url) throw new Error("Storage did not return a URL");
    return j.url;
  };

  const handleAssetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    generation.setError(null); setPublishMessage(null);
    const remaining = 20 - localAssets.length;
    if (remaining <= 0) return;
    const files = selected.slice(0, remaining);
    const staged = files.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, name: file.name, mediaType: mediaTypeFromFile(file), previewUrl: URL.createObjectURL(file), status: "uploading" as const, size: file.size }));
    setLocalAssets((c) => [...c, ...staged]);
    setIsUploadingAssets(true);
    await Promise.allSettled(files.map(async (file, i) => {
      const itemId = staged[i].id;
      if (staged[i].mediaType === "video") { try { const m = await extractVideoMetadata(staged[i].previewUrl); setLocalAssets((c) => c.map((a) => a.id === itemId ? { ...a, durationSec: m.durationSec, width: m.width, height: m.height, posterUrl: m.posterUrl } : a)); } catch { setLocalAssets((c) => c.map((a) => a.id === itemId ? { ...a, error: "Could not parse video metadata" } : a)); } }
      try { const url = await uploadFileToStorage(file, staged[i].mediaType === "video" ? "videos" : "assets"); setLocalAssets((c) => c.map((a) => a.id === itemId ? { ...a, status: "uploaded", storageUrl: url } : a)); } catch (e) { setLocalAssets((c) => c.map((a) => a.id === itemId ? { ...a, status: "local", error: e instanceof Error ? e.message : "Upload failed" } : a)); }
    }));
    setLocalAssets((c) => { syncAssetsToPost(c); return c; });
    setIsUploadingAssets(false);
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    generation.setError(null); setPublishMessage(null);
    const next: LocalAsset = { id: `${Date.now()}-${file.name}`, name: file.name, mediaType: "image", previewUrl: URL.createObjectURL(file), status: "uploading" };
    setLocalLogo((c) => { if (c) revokeObjectUrlIfNeeded(c.previewUrl); return next; });
    try { const url = await uploadFileToStorage(file, "logos"); setLocalLogo((c) => c ? { ...c, status: "uploaded", storageUrl: url } : null); dispatch({ type: "SET_LOGO", logoUrl: url }); }
    catch (e) { setLocalLogo((c) => c ? { ...c, status: "local", error: e instanceof Error ? e.message : "Upload failed" } : null); }
  };
  const removeAsset = useCallback((id: string) => {
    setLocalAssets((current) => {
      const removing = current.find((asset) => asset.id === id);
      if (removing) {
        revokeObjectUrlIfNeeded(removing.previewUrl);
        if (removing.posterUrl) {
          revokeObjectUrlIfNeeded(removing.posterUrl);
        }
      }
      const next = current.filter((asset) => asset.id !== id);
      syncAssetsToPost(next);
      return next;
    });
  }, [syncAssetsToPost]);

  const reorderAssets = useCallback((reordered: LocalAsset[]) => {
    setLocalAssets(reordered); syncAssetsToPost(reordered);
  }, [syncAssetsToPost]);

  const removeLogo = useCallback(() => {
    setLocalLogo((current) => {
      if (current) {
        revokeObjectUrlIfNeeded(current.previewUrl);
      }
      return null;
    });
    dispatch({ type: "SET_LOGO", logoUrl: null });
  }, [dispatch]);

  const generateRef = useRef<(() => Promise<void>) | null>(null);
  const isAgentBusyRef = useRef(isAgentBusy);
  const localAssetsRef = useRef(localAssets);
  const resultRef = useRef(result);
  isAgentBusyRef.current = isAgentBusy;
  localAssetsRef.current = localAssets;
  resultRef.current = result;
  generateRef.current = generation.generate;

  useEffect(() => {
    const onGenerate = () => { if (!isAgentBusyRef.current && localAssetsRef.current.length > 0) void generateRef.current?.(); };
    const onToggleEditor = () => setEditorMode((v) => !v);
    const onSelectVariant = (e: Event) => { const idx = (e as CustomEvent).detail?.index; if (typeof idx === "number" && resultRef.current?.variants[idx]) dispatch({ type: "SET_ACTIVE_VARIANT", variantId: resultRef.current.variants[idx].id }); };
    const onOpenSettings = () => setSettingsOpen(true);
    const onOpenBrandKits = () => setBrandKitsOpen(true);
    window.addEventListener("ig:generate", onGenerate);
    window.addEventListener("ig:toggle-editor", onToggleEditor);
    window.addEventListener("ig:select-variant", onSelectVariant);
    window.addEventListener("ig:open-settings", onOpenSettings);
    window.addEventListener("ig:open-brand-kits", onOpenBrandKits);
    return () => { window.removeEventListener("ig:generate", onGenerate); window.removeEventListener("ig:toggle-editor", onToggleEditor); window.removeEventListener("ig:select-variant", onSelectVariant); window.removeEventListener("ig:open-settings", onOpenSettings); window.removeEventListener("ig:open-brand-kits", onOpenBrandKits); };
  }, [dispatch]);

  const renderPosterToDataUrl = async () => {
    if (!posterRef.current || !activeVariant) throw new Error("No poster selected");
    return withPerf("toPng", () => toPng(posterRef.current!, { cacheBust: true, pixelRatio: 2 }));
  };
  const uploadRenderedPoster = async () => {
    const d = await renderPosterToDataUrl(); const r = await fetch(d); const b = await r.blob();
    return uploadFileToStorage(new File([b], `${slugify(brand.brandName)}-${slugify(post.theme)}-${Date.now()}.png`, { type: "image/png" }), "renders");
  };

  const exportPoster = async () => {
    if (!activeVariant) return;
    try { const d = await renderPosterToDataUrl(); const l = document.createElement("a"); l.href = d; l.download = `${slugify(brand.brandName)}-${slugify(post.theme)}.png`; l.click(); }
    catch (e) { const m = e instanceof Error ? e.message : "Failed to export"; generation.setError(m); toast.error(m); }
  };

  const copyCaption = async () => {
    if (!activeVariant) return;
    try { await navigator.clipboard.writeText(`${activeVariant.caption}\n\n${activeVariant.hashtags.join(" ")}`); setCopyState("done"); setTimeout(() => setCopyState("idle"), 1400); } catch { setCopyState("idle"); }
  };

  const refineVariant = async (instruction?: string) => {
    const inst = instruction?.trim(); if (!activeVariant || !inst) return;
    setIsRefining(true); generation.setError(null);
    try {
      const r = await fetch("/api/generate/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant: activeVariant, instruction: inst, brand }) });
      if (!r.ok) throw new Error(await parseApiError(r));
      const j = await r.json();
      if (j.source !== "model") throw new Error("Refinement could not be applied.");
      if (result) dispatch({ type: "SET_RESULT", result: { ...result, variants: result.variants.map((v) => v.id === activeVariant.id ? { ...j.variant, id: activeVariant.id } : v) }, overlayLayouts });
    } catch (e) { const m = e instanceof Error ? e.message : "Refinement failed"; generation.setError(m); toast.error(m); }
    finally { setIsRefining(false); }
  };

  const handleResetTextLayout = useCallback(() => {
    if (!activeVariant) return;
    dispatch({
      type: "UPDATE_OVERLAY",
      variantId: activeVariant.id,
      layout: createDefaultOverlayLayout(activeVariant.layout),
    });
  }, [activeVariant, dispatch]);

  const createShareLink = async () => {
    if (!result || !activeVariant) return;
    generation.setError(null); setIsSharing(true);
    try {
      const pu = await uploadRenderedPoster();
      const r = await fetch("/api/projects/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, post, assets: localAssets.filter((a) => a.storageUrl).map((a) => ({ id: a.id, name: a.name, mediaType: a.mediaType, durationSec: a.durationSec, posterUrl: a.posterUrl, url: a.storageUrl })), logoUrl: localLogo?.storageUrl, result, activeVariantId: activeVariant.id, overlayLayouts, renderedPosterUrl: pu }) });
      if (!r.ok) throw new Error(await parseApiError(r));
      const j = (await r.json()) as { shareUrl?: string }; if (!j.shareUrl) throw new Error("No share link returned");
      dispatch({ type: "SET_SHARE", shareUrl: j.shareUrl });
      try { await navigator.clipboard.writeText(j.shareUrl); setShareCopyState("done"); setTimeout(() => setShareCopyState("idle"), 1400); } catch { setShareCopyState("idle"); }
    } catch (e) { const m = e instanceof Error ? e.message : "Could not create share link"; generation.setError(m); toast.error(m); }
    finally { setIsSharing(false); }
  };

  const disconnectInstagram = async () => {
    generation.setError(null); setPublishMessage(null); setIsDisconnecting(true);
    try { const r = await fetch("/api/auth/meta/disconnect", { method: "POST" }); if (!r.ok) throw new Error(await parseApiError(r)); await loadAuthStatus(); setPublishMessage("Instagram OAuth disconnected."); toast.success("Instagram OAuth disconnected."); }
    catch (e) { const m = e instanceof Error ? e.message : "Could not disconnect"; generation.setError(m); toast.error(m); }
    finally { setIsDisconnecting(false); }
  };

  const publishToInstagram = async (scheduleAt?: string) => {
    if (!activeVariant) {
      const m = "Generate and select a variant before posting.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    if (!authStatus.connected) { const m = "Connect an Instagram account before publishing."; generation.setError(m); toast.error(m); return; }
    generation.setError(null); setPublishMessage(null); setIsPublishing(true);
    try {
      const seq = activeVariant.assetSequence.map((id) => assetMap.get(id)).filter((a): a is LocalAsset => Boolean(a));
      let media: { mode: string; [key: string]: unknown };
      if (activeVariant.postType === "reel") {
        const ra = seq.find((a) => a.mediaType === "video" && a.storageUrl) ?? localAssets.find((a) => a.mediaType === "video" && a.storageUrl);
        if (!ra?.storageUrl) throw new Error("Reel requires an uploaded video asset.");
        media = { mode: "reel", videoUrl: ra.storageUrl };
      } else if (activeVariant.postType === "carousel") {
        const items = seq.filter((a): a is LocalAsset & { storageUrl: string } => Boolean(a.storageUrl)).slice(0, 10).map((a) => ({ mediaType: a.mediaType, url: a.storageUrl }));
        if (items.length < 2) throw new Error("Carousel needs at least 2 uploaded media assets.");
        media = { mode: "carousel", items };
      } else {
        media = { mode: "image", imageUrl: await uploadRenderedPoster() };
      }
      const caption = `${activeVariant.caption}\n\n${activeVariant.hashtags.join(" ")}`;
      const publishAt = scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
      const r = await fetch("/api/meta/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption, media, publishAt, outcomeContext: { variantName: activeVariant.name, postType: activeVariant.postType, caption: activeVariant.caption, hook: activeVariant.hook, hashtags: activeVariant.hashtags, brandName: brand.brandName, score: activeVariant.score } }) });
      if (!r.ok) throw new Error(await parseApiError(r));
      const j = (await r.json()) as { status?: string; mode?: string; publishAt?: string; publishId?: string };
      if (j.status === "scheduled") {
        const scheduledIso = j.publishAt ?? publishAt;
        const scheduledDate = scheduledIso ? new Date(scheduledIso) : null;
        const scheduledText = scheduledDate && !Number.isNaN(scheduledDate.getTime())
          ? scheduledDate.toLocaleString()
          : "the selected time";
        const m = `Scheduled for ${scheduledText} (${localTimeZone})`;
        setPublishMessage(m);
        toast.success(m);
      }
      else { const m = "Published to Instagram successfully."; setPublishMessage(m); toast.success(m); dispatch({ type: "ADD_PUBLISH", entry: { publishedAt: new Date().toISOString(), igMediaId: j.publishId } }); }
    } catch (e) { const m = e instanceof Error ? e.message : "Instagram publish failed"; generation.setError(m); toast.error(m); }
    finally { setIsPublishing(false); }
  };

  const publishToInstagramRef = useRef<(scheduleAt?: string) => Promise<void>>(async () => {});
  publishToInstagramRef.current = publishToInstagram;

  const requestGenerateForPost = useCallback(async (postId: string) => {
    if (!postId) return;
    if (activePost?.id !== postId) {
      setPendingGenerateRequest({ postId });
      await selectPost(postId);
      return;
    }
    if (isAgentBusyRef.current) return;
    if (localAssetsRef.current.length === 0) {
      const m = "Upload assets before generating concepts.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    await generateRef.current?.();
  }, [activePost?.id, generation, selectPost]);

  const requestPublishForPost = useCallback(async (postId: string, scheduleAt?: string) => {
    if (!postId) return;
    if (activePost?.id !== postId) {
      setPendingPublishRequest({ postId, scheduleAt });
      await selectPost(postId);
      return;
    }
    await publishToInstagramRef.current(scheduleAt);
  }, [activePost?.id, selectPost]);

  useEffect(() => {
    if (!pendingGenerateRequest || activePost?.id !== pendingGenerateRequest.postId) {
      return;
    }

    // Wait until this post's assets are hydrated into local state.
    if (hydratedAssetsPostId !== pendingGenerateRequest.postId) {
      return;
    }

    setPendingGenerateRequest(null);
    if (isAgentBusyRef.current) return;
    if (localAssetsRef.current.length === 0) {
      const m = "Upload assets before generating concepts.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    void generateRef.current?.();
  }, [activePost?.id, generation, hydratedAssetsPostId, pendingGenerateRequest]);

  useEffect(() => {
    if (!pendingPublishRequest || activePost?.id !== pendingPublishRequest.postId) {
      return;
    }

    // Wait one more render for variant hydration after post selection.
    if (activePost?.result?.variants?.length && !activeVariant) {
      return;
    }

    const scheduleAt = pendingPublishRequest.scheduleAt;
    setPendingPublishRequest(null);
    void publishToInstagramRef.current(scheduleAt);
  }, [activePost?.id, activePost?.result?.variants?.length, activeVariant, pendingPublishRequest]);

  // Empty state
  if (!activePost) {
    return (
      <>
        <AppShell showFooterStatusBar={false}>
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <Sparkles className="h-10 w-10 text-orange-300/60" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-white">No post selected</h2>
              <p className="mt-2 text-sm text-slate-400">Select a post from the sidebar or create a new one to get started.</p>
              <Button onClick={() => { setIsCreatingPost(true); createNewPost().catch((e) => { const msg = e instanceof Error ? e.message : "Failed to create post"; generation.setError(msg); toast.error(msg); }).finally(() => setIsCreatingPost(false)); }} disabled={isCreatingPost} className="mt-6">
                {isCreatingPost ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Create Your First Post
              </Button>
            </div>
          </div>
        </AppShell>
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenBrandKits={() => { setSettingsOpen(false); setBrandKitsOpen(true); }} />
        <BrandKitModal open={brandKitsOpen} onClose={() => { setBrandKitsOpen(false); setSettingsOpen(true); }} />
      </>
    );
  }

  return (
    <>
      <AppShell showFooterStatusBar={false}>
        <div className="pb-14" aria-busy={isAgentBusy}>
          {!brand.brandName && (
            <div className="mx-4 mb-4 rounded-xl border border-orange-300/30 bg-orange-400/10 p-3 text-xs text-orange-100 md:mx-8">
              No saved brand kit found.{" "}
              <button type="button" onClick={() => setBrandKitsOpen(true)} className="font-semibold underline">Set up your Brand Kit</button>{" "}
              for better results.
            </div>
          )}
          <div className="mx-4 md:mx-8"><OnboardingChecklist /></div>

          {/* Desktop 3-column layout */}
          <div className="hidden lg:block" style={{ height: "calc(100vh - 140px)" }}>
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel panelRef={leftPanelRef} defaultSize={18} minSize={12} collapsible collapsedSize={0} onResize={(size) => setLeftCollapsed(size.asPercentage === 0)} className="flex flex-col">
                <div className="flex h-full flex-col rounded-xl border border-white/15 bg-slate-900/55 backdrop-blur-xl ml-4">
                  <SidebarContent
                    onGenerate={(postId) => void requestGenerateForPost(postId)}
                    onPostNow={(postId) => void requestPublishForPost(postId)}
                    onSchedulePost={(postId, scheduleAt) =>
                      void requestPublishForPost(postId, scheduleAt)
                    }
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className="mx-1 bg-white/5 hover:bg-white/10" />
              <ResizablePanel defaultSize={52} minSize={35}>
                <ScrollArea className="h-full px-4">
                  <div className="space-y-6 py-4">
                    <section className="border-b border-white/10 pb-6">
                      <PostBriefForm post={post} llmAuthStatus={llmAuthStatus} isGenerating={generation.isGenerating} isUploadingAssets={isUploadingAssets} hasAssets={localAssets.length > 0} hasResult={!!activeVariant} brandKits={brandKitOptions} activeBrandKitId={activePost?.brandKitId} dispatch={typedDispatch} onGenerate={() => void generation.generate()} onExportPoster={() => void exportPoster()} onSelectBrandKit={(id) => void handleSelectBrandKit(id)} />
                    </section>
                    <section className="border-b border-white/10 pb-6">
                      <AssetManager assets={localAssets} logo={localLogo} onRemove={removeAsset} onReorder={reorderAssets} onAssetUpload={(e) => void handleAssetUpload(e)} onLogoUpload={(e) => void handleLogoUpload(e)} onRemoveLogo={removeLogo} />
                    </section>
                    <section className="border-b border-white/10 pb-6">
                      <PosterSection posterRef={posterRef} activeVariant={activeVariant} brandName={brand.brandName} aspectRatio={post.aspectRatio} primaryVisual={primaryVisual} secondaryVisual={secondaryVisual} logoImage={localLogo?.previewUrl} editorMode={editorMode} overlayLayout={activeOverlayLayout} activeSlideIndex={activeSlideIndex} dispatch={typedDispatch} />
                    </section>
                    {result && (
                      <section className="border-b border-white/10 pb-6">
                        <StrategySection result={result} activeVariant={activeVariant} editorMode={editorMode} isRefining={isRefining} dispatch={typedDispatch} setEditorMode={setEditorMode} onResetTextLayout={handleResetTextLayout} onRefineVariant={(inst) => void refineVariant(inst)} onCopyCaption={() => void copyCaption()} copyState={copyState} />
                      </section>
                    )}
                    {activeVariant && (
                      <section className="pb-6">
                        <PublishSection authStatus={authStatus} isAuthLoading={isAuthLoading} isDisconnecting={isDisconnecting} isSharing={isSharing} isPublishing={isPublishing} shareUrl={shareUrl} shareCopyState={shareCopyState} localTimeZone={localTimeZone} onDisconnectInstagram={() => void disconnectInstagram()} onCreateShareLink={() => void createShareLink()} onPostNow={() => void publishToInstagram()} onSchedulePost={(scheduleAt) => void publishToInstagram(scheduleAt)} />
                      </section>
                    )}
                  </div>
                </ScrollArea>
              </ResizablePanel>
              <ResizableHandle withHandle className="mx-1 bg-white/5 hover:bg-white/10" />
              <ResizablePanel panelRef={rightPanelRef} defaultSize={30} minSize={18} collapsible collapsedSize={0} onResize={(size) => setRightCollapsed(size.asPercentage === 0)} className="flex flex-col">
                <div className="flex h-full flex-col rounded-xl border border-white/15 bg-slate-900/55 backdrop-blur-xl mr-4 overflow-hidden">
                  {/* Agent / Chat tab switcher */}
                  <div className="flex shrink-0 border-b border-white/10" role="tablist" aria-label="Right panel tabs">
                    <button type="button" role="tab" aria-selected={rightPanelTab === "agent"} onClick={() => setRightPanelTab("agent")} className={cn("flex-1 px-3 py-2 text-xs font-semibold transition", rightPanelTab === "agent" ? "border-b-2 border-orange-400 text-orange-200" : "text-slate-400 hover:text-white")}>Agent</button>
                    <button type="button" role="tab" aria-selected={rightPanelTab === "chat"} onClick={() => setRightPanelTab("chat")} className={cn("flex-1 px-3 py-2 text-xs font-semibold transition", rightPanelTab === "chat" ? "border-b-2 border-orange-400 text-orange-200" : "text-slate-400 hover:text-white")}>Chat</button>
                  </div>
                  {rightPanelTab === "agent" ? (
                    <div ref={activityPanelRef} className="flex-1 overflow-y-auto p-4">
                      <AgentActivityPanel agentRun={generation.agentRun} agentVerbosity={generation.agentVerbosity} setAgentVerbosity={generation.setAgentVerbosity} showStepDetails={generation.showStepDetails} setShowStepDetails={generation.setShowStepDetails} visibleAgentSteps={generation.visibleAgentSteps} runProgress={generation.runProgress} runDurationMs={generation.runDurationMs} runClock={generation.runClock} runLogCopyState={generation.runLogCopyState} onCopyRunLog={() => void generation.copyRunLog()} />
                    </div>
                  ) : (
                    <ChatPanel />
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
            <div className="fixed left-2 top-1/2 z-40 -translate-y-1/2">
              <Button variant="outline" size="icon-xs" onClick={() => { const p = leftPanelRef.current; if (p) { if (p.isCollapsed()) p.expand(); else p.collapse(); } }} className="h-8 w-5 rounded-full border-white/20 bg-slate-900/80 text-slate-400 hover:text-white" aria-label={leftCollapsed ? "Expand post list panel" : "Collapse post list panel"}>
                {leftCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
              </Button>
            </div>
            <div className="fixed right-2 top-1/2 z-40 -translate-y-1/2">
              <Button variant="outline" size="icon-xs" onClick={() => { const p = rightPanelRef.current; if (p) { if (p.isCollapsed()) p.expand(); else p.collapse(); } }} className="h-8 w-5 rounded-full border-white/20 bg-slate-900/80 text-slate-400 hover:text-white" aria-label={rightCollapsed ? "Expand insights panel" : "Collapse insights panel"}>
                {rightCollapsed ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Mobile single column */}
          <div className="space-y-6 px-4 lg:hidden">
            <PostBriefForm post={post} llmAuthStatus={llmAuthStatus} isGenerating={generation.isGenerating} isUploadingAssets={isUploadingAssets} hasAssets={localAssets.length > 0} hasResult={!!activeVariant} brandKits={brandKitOptions} activeBrandKitId={activePost?.brandKitId} dispatch={typedDispatch} onGenerate={() => void generation.generate()} onExportPoster={() => void exportPoster()} onSelectBrandKit={(id) => void handleSelectBrandKit(id)} />
            <AssetManager assets={localAssets} logo={localLogo} onRemove={removeAsset} onReorder={reorderAssets} onAssetUpload={(e) => void handleAssetUpload(e)} onLogoUpload={(e) => void handleLogoUpload(e)} onRemoveLogo={removeLogo} />
            <PosterSection posterRef={posterRef} activeVariant={activeVariant} brandName={brand.brandName} aspectRatio={post.aspectRatio} primaryVisual={primaryVisual} secondaryVisual={secondaryVisual} logoImage={localLogo?.previewUrl} editorMode={editorMode} overlayLayout={activeOverlayLayout} activeSlideIndex={activeSlideIndex} dispatch={typedDispatch} />
            {result && <StrategySection result={result} activeVariant={activeVariant} editorMode={editorMode} isRefining={isRefining} dispatch={typedDispatch} setEditorMode={setEditorMode} onResetTextLayout={handleResetTextLayout} onRefineVariant={(inst) => void refineVariant(inst)} onCopyCaption={() => void copyCaption()} copyState={copyState} />}
            {activeVariant && <PublishSection authStatus={authStatus} isAuthLoading={isAuthLoading} isDisconnecting={isDisconnecting} isSharing={isSharing} isPublishing={isPublishing} shareUrl={shareUrl} shareCopyState={shareCopyState} localTimeZone={localTimeZone} onDisconnectInstagram={() => void disconnectInstagram()} onCreateShareLink={() => void createShareLink()} onPostNow={() => void publishToInstagram()} onSchedulePost={(scheduleAt) => void publishToInstagram(scheduleAt)} />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMobileAgentSheetOpen(true)} className="flex-1">Agent Activity</Button>
              <Button variant="outline" size="sm" onClick={() => setMobileChatSheetOpen(true)} className="flex-1">Chat</Button>
            </div>
          </div>
        </div>
      </AppShell>

      <MobileSidebarDrawer
        onGenerate={(postId) => void requestGenerateForPost(postId)}
        onPostNow={(postId) => void requestPublishForPost(postId)}
        onSchedulePost={(postId, scheduleAt) =>
          void requestPublishForPost(postId, scheduleAt)
        }
      />
      <Sheet open={mobileAgentSheetOpen} onOpenChange={setMobileAgentSheetOpen}>
        <SheetContent side="right" className="w-[340px] border-l border-white/15 bg-slate-900/95 p-4 backdrop-blur-xl">
          <SheetHeader><SheetTitle className="text-xs font-semibold tracking-[0.16em] text-blue-200 uppercase">Agent Activity</SheetTitle></SheetHeader>
          <div className="mt-4">
            <AgentActivityPanel agentRun={generation.agentRun} agentVerbosity={generation.agentVerbosity} setAgentVerbosity={generation.setAgentVerbosity} showStepDetails={generation.showStepDetails} setShowStepDetails={generation.setShowStepDetails} visibleAgentSteps={generation.visibleAgentSteps} runProgress={generation.runProgress} runDurationMs={generation.runDurationMs} runClock={generation.runClock} runLogCopyState={generation.runLogCopyState} onCopyRunLog={() => void generation.copyRunLog()} />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={mobileChatSheetOpen} onOpenChange={setMobileChatSheetOpen}>
        <SheetContent side="right" className="w-[340px] border-l border-white/15 bg-slate-900/95 p-0 backdrop-blur-xl">
          <ChatPanel />
        </SheetContent>
      </Sheet>

      {/* Status bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/15 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 md:px-8">
          <div className="min-w-0 flex-1">
            <p role="status" aria-live="polite" aria-atomic="true" className={cn("flex items-center gap-2 text-xs font-medium", statusLine.tone === "error" ? "text-red-200" : statusLine.tone === "success" ? "text-emerald-200" : statusLine.tone === "active" ? "text-blue-200" : "text-slate-200")}>
              <span className={cn("inline-block h-2 w-2 flex-none rounded-full", statusLine.tone === "error" ? "bg-red-300" : statusLine.tone === "success" ? "bg-emerald-300" : statusLine.tone === "active" ? "bg-blue-300" : "bg-slate-400")} />
              <span className="truncate">{statusLine.text}</span>
            </p>
            {statusLine.tone === "error" && (
              <p role="alert" className="sr-only">
                {statusLine.text}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {typeof statusLine.elapsedMs === "number" && <Badge variant="outline" className="text-[11px] text-slate-300">{formatElapsed(statusLine.elapsedMs)}</Badge>}
            <Button variant="outline" size="xs" className="hidden lg:inline-flex" onClick={() => { activityPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); generation.setShowStepDetails(true); }}>View Details</Button>
            <Button variant="outline" size="xs" className="lg:hidden" onClick={() => setMobileAgentSheetOpen(true)}>View Details</Button>
            {statusLine.showStop && <Button variant="destructive" size="xs" onClick={generation.stopGeneration} className="border border-red-300/35 bg-red-400/10 text-red-100 hover:bg-red-400/20"><Square className="h-3 w-3 fill-current" />Stop</Button>}
            {(generation.agentRun?.status === "error" || generation.agentRun?.status === "cancelled") && canRetryGeneration && <Button variant="outline" size="xs" onClick={() => void generation.generate()}><RefreshCw className="h-3 w-3" />Retry</Button>}
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenBrandKits={() => { setSettingsOpen(false); setBrandKitsOpen(true); }} />
      <BrandKitModal open={brandKitsOpen} onClose={() => { setBrandKitsOpen(false); setSettingsOpen(true); }} />
    </>
  );
}
