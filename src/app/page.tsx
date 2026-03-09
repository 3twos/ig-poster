"use client";

import { toBlob, toPng } from "html-to-image";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  Pencil,
  Save,
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
import { CarouselComposer } from "@/components/carousel-composer";
import { ChatPanel } from "@/components/chat";
import { PublishMetadataEditor } from "@/components/publish-metadata-editor";
import { AppShell } from "@/components/app-shell";
import { AssetManager } from "@/components/asset-manager";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import {
  PostBriefActions,
  PostBriefAspectRatio,
  PostBriefForm,
} from "@/components/post-brief-form";
import { PosterSection } from "@/components/poster-section";
import { MobileSidebarDrawer, SidebarContent } from "@/components/post-sidebar";
import { PublishSection } from "@/components/publish-section";
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
import type { BrandKitRow } from "@/db/schema";
import { useGeneration } from "@/hooks/use-generation";
import { inferLogoNameFromUrl } from "@/lib/brand-kit";
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
  type PublishSettingsState,
  INITIAL_BRAND,
  INITIAL_POST,
  INITIAL_PUBLISH_SETTINGS,
} from "@/lib/types";
import {
  alignMediaCompositionOrientation,
  aspectRatioFromOrientation,
  mediaCompositionEquals,
  normalizeAssetSequence,
  reconcileMediaComposition,
  type MediaComposition,
} from "@/lib/media-composer";
import {
  extractVideoMetadata,
  mediaTypeFromFile,
  parseApiError,
  revokeObjectUrlIfNeeded,
} from "@/lib/upload-helpers";
import { withPerf } from "@/lib/perf";
import {
  formatDateTimeInTimeZone,
  parseDateTimeLocalInput,
} from "@/lib/time-zone";
import { cn, slugify } from "@/lib/utils";
import { toast } from "sonner";
import {
  PublishJobListResponseSchema,
  type MetaUserTag,
} from "@/lib/meta-schemas";

const normalizeTagUsername = (value: string) => value.trim().replace(/^@/, "");

const normalizeUserTags = (tags: MetaUserTag[] | null | undefined) =>
  (tags ?? [])
    .map((tag) => ({
      username: normalizeTagUsername(tag.username),
      x: tag.x,
      y: tag.y,
    }))
    .filter((tag) => tag.username.length > 0);

export default function Home() {
  const {
    activePost,
    archivePost,
    posts,
    dispatch,
    createNewPost,
    duplicatePost,
    refreshPosts,
    selectPost,
    saveNow,
    saveStatus,
  } = usePostContext();

  const [localAssets, setLocalAssets] = useState<LocalAsset[]>([]);
  const [editorMode, setEditorMode] = useState(false);
  const [uploadingAssetsForPostId, setUploadingAssetsForPostId] = useState<string | null>(null);
  const [sharingForPostId, setSharingForPostId] = useState<string | null>(null);
  const [publishingForPostId, setPublishingForPostId] = useState<string | null>(null);
  const [publishMessageState, setPublishMessageState] = useState<{ postId: string | null; text: string | null }>({ postId: null, text: null });
  const [copyState, setCopyState] = useState<"idle" | "done">("idle");
  const [shareCopyState, setShareCopyState] = useState<"idle" | "done">("idle");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<InstagramAuthStatus>({ connected: false, source: null });
  const [llmAuthStatus, setLlmAuthStatus] = useState<LlmAuthStatus>({ connected: false, source: null });
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [refiningForPostId, setRefiningForPostId] = useState<string | null>(null);
  const [mobileAgentSheetOpen, setMobileAgentSheetOpen] = useState(false);
  const [mobileChatSheetOpen, setMobileChatSheetOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"agent" | "chat">("agent");
  const [brandKits, setBrandKits] = useState<BrandKitRow[]>([]);
  const [hydratedAssetsPostId, setHydratedAssetsPostId] = useState<string | null>(null);
  const [pendingGenerateRequest, setPendingGenerateRequest] = useState<{ postId: string } | null>(null);
  const [pendingPublishRequest, setPendingPublishRequest] = useState<{ postId: string; scheduleAt?: string } | null>(null);
  const [publishJobsRefreshKey, setPublishJobsRefreshKey] = useState(0);
  const [publishImagePreviewUrl, setPublishImagePreviewUrl] = useState<string | null>(null);

  const posterRef = useRef<HTMLDivElement>(null);
  const activityPanelRef = useRef<HTMLDivElement>(null);
  const assetCleanupRef = useRef<LocalAsset[]>([]);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);
  const rightPanelRef = useRef<PanelImperativeHandle>(null);
  const publishImagePreviewRenderIdRef = useRef(0);
  const publishImagePreviewBlobUrlRef = useRef<string | null>(null);
  const activePostIdRef = useRef<string | null>(activePost?.id ?? null);
  const activePostStatusRef = useRef<string | null>(activePost?.status ?? null);
  const assetUploadAbortRef = useRef<{ postId: string; controller: AbortController } | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  activePostIdRef.current = activePost?.id ?? null;
  activePostStatusRef.current = activePost?.status ?? null;

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
  const localAssetIds = useMemo(
    () => localAssets.map((asset) => asset.id),
    [localAssets],
  );
  const mediaComposition = useMemo(
    () =>
      alignMediaCompositionOrientation(
        reconcileMediaComposition(
          activePost?.mediaComposition,
          localAssetIds,
          post.aspectRatio,
        ),
        post.aspectRatio,
      ),
    [activePost?.mediaComposition, localAssetIds, post.aspectRatio],
  );
  const activeSlideIndex = activePost?.activeSlideIndex ?? 0;
  const shareUrl = activePost?.shareUrl ?? null;
  const promptConfig: PromptConfigState = useMemo(
    () => ({
      systemPrompt: activePost?.promptConfig?.systemPrompt ?? "",
      customInstructions: activePost?.promptConfig?.customInstructions ?? "",
    }),
    [activePost?.promptConfig],
  );
  const publishSettings: PublishSettingsState = useMemo(
    () => ({
      ...INITIAL_PUBLISH_SETTINGS,
      ...(activePost?.publishSettings ?? {}),
    }),
    [activePost?.publishSettings],
  );
  const activeBrandKit = useMemo(
    () => brandKits.find((kit) => kit.id === activePost?.brandKitId) ?? null,
    [activePost?.brandKitId, brandKits],
  );
  const selectedLogo = useMemo<LocalAsset | null>(() => {
    const logoUrl = activePost?.logoUrl;
    if (!logoUrl) {
      return null;
    }

    const matchingLogo = activeBrandKit?.logos.find((logo) => logo.url === logoUrl);

    return {
      id: matchingLogo?.id ?? "selected-logo",
      name: matchingLogo?.name ?? inferLogoNameFromUrl(logoUrl),
      mediaType: "image",
      previewUrl: logoUrl,
      storageUrl: logoUrl,
      status: "uploaded",
    };
  }, [activeBrandKit?.logos, activePost?.logoUrl]);
  const localTimeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "local time",
    [],
  );
  const isUploadingAssets = uploadingAssetsForPostId === activePost?.id;
  const isSharing = sharingForPostId === activePost?.id;
  const isPublishing = publishingForPostId === activePost?.id;
  const isRefining = refiningForPostId === activePost?.id;
  const publishMessage = publishMessageState.postId === activePost?.id ? publishMessageState.text : null;
  const isPostedPost = activePost?.status === "posted";
  const isScheduledPost = activePost?.status === "scheduled";
  const latestPublishEntry = activePost?.publishHistory.at(-1) ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedDispatch = dispatch as (action: any) => void;

  const generation = useGeneration({
    postId: activePost?.id ?? null,
    brand,
    post,
    localAssets,
    localLogo: selectedLogo,
    promptConfig,
    dispatch: typedDispatch,
  });

  useEffect(() => {
    if (!activePost) {
      setLocalAssets([]);
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
    setHydratedAssetsPostId(activePost.id);
    generation.setError(null);
    setPublishMessageState({ postId: activePost.id, text: null });
    setEditorMode(false);
  }, [activePost?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activePost) return;
    if (mediaCompositionEquals(activePost.mediaComposition, mediaComposition)) {
      return;
    }
    dispatch({
      type: "SET_MEDIA_COMPOSITION",
      postId: activePost.id,
      mediaComposition,
    });
  }, [activePost, dispatch, mediaComposition]);

  const syncAssetsToPost = useCallback(
    (postId: string | null, assets: LocalAsset[]) => {
      if (!postId || activePostIdRef.current !== postId) {
        return;
      }
      const stored = assets
        .filter((a) => a.status === "uploaded" && a.storageUrl)
        .map((a) => ({ id: a.id, name: a.name, url: a.storageUrl!, mediaType: a.mediaType, posterUrl: a.posterUrl, durationSec: a.durationSec }));
      dispatch({ type: "SET_ASSETS", postId, assets: stored });
    },
    [dispatch],
  );

  const isAbortError = (error: unknown) =>
    error instanceof Error && error.name === "AbortError";

  const abortUploadsForPostSwitch = useCallback((postId: string | null) => {
    if (!postId) {
      return;
    }

    if (assetUploadAbortRef.current?.postId === postId) {
      assetUploadAbortRef.current.controller.abort("post-switch");
      assetUploadAbortRef.current = null;
    }

    setUploadingAssetsForPostId((current) => current === postId ? null : current);
  }, []);

  useEffect(() => { assetCleanupRef.current = localAssets; }, [localAssets]);
  useEffect(() => {
    return () => {
      assetUploadAbortRef.current?.controller.abort("unmount");
      assetCleanupRef.current.forEach((a) => {
        revokeObjectUrlIfNeeded(a.previewUrl);
        if (a.posterUrl) {
          revokeObjectUrlIfNeeded(a.posterUrl);
        }
      });
    };
  }, []);

  const isPostStillActive = useCallback(
    (postId: string | null) => activePostIdRef.current === postId,
    [],
  );

  const setLocalAssetsForPost = useCallback(
    (postId: string | null, update: (current: LocalAsset[]) => LocalAsset[]) => {
      setLocalAssets((current) => (isPostStillActive(postId) ? update(current) : current));
    },
    [isPostStillActive],
  );

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
        setBrandKits((j.kits ?? []) as BrandKitRow[]);
      }
    } catch { /* ignore */ }
  }, []);

  const handleSelectBrandKit = useCallback((kitId: string) => {
    const postId = activePostIdRef.current;
    if (activePostStatusRef.current === "posted") {
      return;
    }
    const kit = brandKits.find((candidate) => candidate.id === kitId);
    if (!kit || !isPostStillActive(postId)) {
      return;
    }

    dispatch({
      type: "SET_BRAND_KIT",
      postId: postId ?? undefined,
      brandKitId: kitId,
      brand: kit.brand ?? {},
      logoUrl: kit.logos[0]?.url ?? kit.logoUrl ?? null,
      promptConfig: kit.promptConfig ?? null,
    });
  }, [brandKits, dispatch, isPostStillActive]);

  const handleSelectLogo = useCallback((logoUrl: string | null) => {
    if (activePostStatusRef.current === "posted") {
      return;
    }
    dispatch({
      type: "SET_LOGO",
      postId: activePostIdRef.current ?? undefined,
      logoUrl,
    });
  }, [dispatch]);

  useEffect(() => {
    void loadAuthStatus();
    void loadLlmStatus();
    void loadBrandKits();
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    const detail = params.get("detail");
    if (auth === "connected") { setPublishMessageState({ postId: activePostIdRef.current, text: "Instagram account connected." }); toast.success("Instagram account connected."); }
    if (auth === "error" && detail) { const s = detail.slice(0, 200).replace(/[<>"']/g, ""); generation.setError(s); toast.error(s); }
    if (auth) { params.delete("auth"); params.delete("detail"); const n = params.toString(); window.history.replaceState({}, "", n ? `${window.location.pathname}?${n}` : window.location.pathname); }
  }, [loadAuthStatus, loadLlmStatus, loadBrandKits]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeVariant = useMemo(() => {
    if (!result?.variants.length) return null;
    return result.variants.find((v) => v.id === activeVariantId) ?? result.variants[0];
  }, [activeVariantId, result]);

  const patchResult = useCallback(
    (update: (current: GenerationResponse) => GenerationResponse) => {
      if (!result) return;
      dispatch({
        type: "SET_RESULT",
        postId: activePostIdRef.current ?? undefined,
        result: update(result),
        overlayLayouts,
      });
    },
    [dispatch, overlayLayouts, result],
  );

  const updateMediaComposition = useCallback(
    (update: (current: MediaComposition) => MediaComposition) => {
      const postId = activePostIdRef.current;
      if (!postId) return;
      dispatch({
        type: "SET_MEDIA_COMPOSITION",
        postId,
        mediaComposition: update(mediaComposition),
      });
    },
    [dispatch, mediaComposition],
  );

  const updateActiveVariantAssetSequence = useCallback(
    (nextSequence: string[]) => {
      if (!activeVariant) return;
      const normalized = normalizeAssetSequence(nextSequence, localAssetIds);
      if (!normalized.length) return;
      if (
        normalized.length === activeVariant.assetSequence.length &&
        normalized.every(
          (assetId, index) => assetId === activeVariant.assetSequence[index],
        )
      ) {
        return;
      }

      patchResult((current) => ({
        ...current,
        variants: current.variants.map((variant) =>
          variant.id === activeVariant.id
            ? { ...variant, assetSequence: normalized }
            : variant,
        ),
      }));

      if (activeSlideIndex >= normalized.length) {
        dispatch({
          type: "SET_ACTIVE_SLIDE",
          index: Math.max(normalized.length - 1, 0),
        });
      }
    },
    [activeSlideIndex, activeVariant, dispatch, localAssetIds, patchResult],
  );

  useEffect(() => { dispatch({ type: "SET_ACTIVE_SLIDE", index: 0 }); }, [activeVariantId, dispatch]);

  useEffect(() => {
    if (!result || localAssetIds.length === 0) return;
    let didChange = false;

    const nextVariants = result.variants.map((variant) => {
      const filtered = normalizeAssetSequence(variant.assetSequence, localAssetIds);
      if (
        filtered.length === variant.assetSequence.length &&
        filtered.every((assetId, index) => assetId === variant.assetSequence[index])
      ) {
        return variant;
      }

      didChange = true;
      return {
        ...variant,
        assetSequence: filtered.length ? filtered : localAssetIds.slice(0, 1),
      };
    });

    if (!didChange) return;

    patchResult((current) => ({
      ...current,
      variants: nextVariants,
    }));
  }, [localAssetIds, patchResult, result]);

  const activeOverlayLayout = useMemo(() => {
    if (!activeVariant) return undefined;
    return (
      overlayLayouts[activeVariant.id] ??
      createDefaultOverlayLayout(activeVariant.layout, { cornerRadius: brand.defaultCornerRadius, bgOpacity: brand.defaultBgOpacity })
    );
  }, [activeVariant, overlayLayouts]);

  const handleCarouselComposerSequenceChange = useCallback(
    (nextSequence: string[]) => {
      updateActiveVariantAssetSequence(nextSequence);
      const includedAssetIds = new Set(nextSequence);
      updateMediaComposition((current) => ({
        ...current,
        items: current.items.map((item) => ({
          ...item,
          excludedFromPost: !includedAssetIds.has(item.assetId),
        })),
      }));
    },
    [updateActiveVariantAssetSequence, updateMediaComposition],
  );

  const handleCarouselOrientationChange = useCallback(
    (orientation: MediaComposition["orientation"]) => {
      updateMediaComposition((current) => ({
        ...current,
        orientation,
      }));
      dispatch({
        type: "UPDATE_BRIEF",
        brief: {
          aspectRatio: aspectRatioFromOrientation(orientation),
        },
      });
    },
    [dispatch, updateMediaComposition],
  );

  const updatePublishSettings = useCallback(
    (nextSettings: Partial<PublishSettingsState>) => {
      const postId = activePostIdRef.current;
      if (!postId || activePostStatusRef.current === "posted") return;
      dispatch({
        type: "SET_PUBLISH_SETTINGS",
        postId,
        publishSettings: nextSettings,
      });
    },
    [dispatch],
  );

  const updateAssetUserTags = useCallback(
    (assetId: string, userTags: MetaUserTag[]) => {
      if (activePostStatusRef.current === "posted") {
        return;
      }
      updateMediaComposition((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.assetId === assetId
            ? {
                ...item,
                userTags: userTags.length ? userTags : undefined,
              }
            : item,
        ),
      }));
    },
    [updateMediaComposition],
  );

  const assetMap = useMemo(() => new Map(localAssets.map((a) => [a.id, a])), [localAssets]);
  const mediaCompositionItemsByAssetId = useMemo(
    () => new Map(mediaComposition.items.map((item) => [item.assetId, item])),
    [mediaComposition.items],
  );
  const carouselComposerSequence = useMemo(() => {
    if (!activeVariant || activeVariant.postType !== "carousel") {
      return [];
    }
    const filtered = normalizeAssetSequence(activeVariant.assetSequence, localAssetIds);
    return filtered.length ? filtered : localAssetIds.slice(0, 10);
  }, [activeVariant, localAssetIds]);

  const orderedVariantAssets = useMemo(() => {
    if (!activeVariant) return localAssets;
    const ordered = normalizeAssetSequence(activeVariant.assetSequence, localAssetIds)
      .map((id) => assetMap.get(id))
      .filter((a): a is LocalAsset => Boolean(a));
    if (!ordered.length) return localAssets;
    const used = new Set(ordered.map((a) => a.id));
    return [...ordered, ...localAssets.filter((a) => !used.has(a.id))];
  }, [activeVariant, assetMap, localAssetIds, localAssets]);

  const getDisplayVisual = (asset?: LocalAsset) => {
    if (!asset) return undefined;
    return asset.mediaType === "video" ? (asset.posterUrl || undefined) : asset.previewUrl;
  };

  const primaryVisualIndex = activeVariant?.postType === "carousel" ? activeSlideIndex : 0;
  const primaryVisual = getDisplayVisual(orderedVariantAssets[primaryVisualIndex]);
  const secondaryVisual = getDisplayVisual(orderedVariantAssets[1]);
  const generatedCaptionBundle = useMemo(() => {
    if (!activeVariant) return "";
    const hashtags = activeVariant.hashtags.join(" ");
    return hashtags
      ? `${activeVariant.caption}\n\n${hashtags}`
      : activeVariant.caption;
  }, [activeVariant]);
  const effectiveCaption = useMemo(() => {
    const trimmed = publishSettings.caption.trim();
    return trimmed || generatedCaptionBundle;
  }, [generatedCaptionBundle, publishSettings.caption]);
  const primaryPublishAsset = useMemo(() => {
    if (!activeVariant) return null;

    const sequenceAssets = activeVariant.assetSequence
      .map((id) => assetMap.get(id))
      .filter((asset): asset is LocalAsset => Boolean(asset));

    if (activeVariant.postType === "reel") {
      return (
        sequenceAssets.find((asset) => asset.mediaType === "video") ??
        localAssets.find((asset) => asset.mediaType === "video") ??
        null
      );
    }

    return sequenceAssets[0] ?? null;
  }, [activeVariant, assetMap, localAssets]);
  const singlePublishTagAsset = useMemo(() => {
    if (!activeVariant || activeVariant.postType === "carousel" || !primaryPublishAsset) {
      return null;
    }

    return {
      assetId: primaryPublishAsset.id,
      name: primaryPublishAsset.name,
      mediaType: primaryPublishAsset.mediaType,
      previewUrl:
        activeVariant.postType === "single-image"
          ? (publishImagePreviewUrl ?? getDisplayVisual(primaryPublishAsset))
          : getDisplayVisual(primaryPublishAsset),
      userTags:
        mediaCompositionItemsByAssetId.get(primaryPublishAsset.id)?.userTags ?? [],
    };
  }, [
    activeVariant,
    mediaCompositionItemsByAssetId,
    primaryPublishAsset,
    publishImagePreviewUrl,
  ]);
  const carouselTagAssets = useMemo(() => {
    if (!activeVariant || activeVariant.postType !== "carousel") {
      return [];
    }

    return carouselComposerSequence
      .map((assetId) => assetMap.get(assetId))
      .filter((asset): asset is LocalAsset => Boolean(asset))
      .map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        mediaType: asset.mediaType,
        previewUrl: getDisplayVisual(asset),
        userTags: mediaCompositionItemsByAssetId.get(asset.id)?.userTags ?? [],
      }));
  }, [
    activeVariant,
    assetMap,
    carouselComposerSequence,
    mediaCompositionItemsByAssetId,
  ]);
  const hasIncompletePublishUserTags = useMemo(
    () =>
      [
        ...(singlePublishTagAsset ? [singlePublishTagAsset.userTags] : []),
        ...carouselTagAssets.map((asset) => asset.userTags),
      ].some((tags) =>
        tags.some((tag) => normalizeTagUsername(tag.username).length === 0),
      ),
    [carouselTagAssets, singlePublishTagAsset],
  );

  const isAgentBusy = generation.isGenerating || isUploadingAssets || isSharing || isPublishing || isRefining;


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
    if (saveStatus === "error") return { tone: "error" as const, text: "Autosave failed. Keep this tab open and use Save now before leaving.", elapsedMs: undefined, showStop: false };
    if (saveStatus === "saving") return { tone: "active" as const, text: "Saving draft changes...", elapsedMs: undefined, showStop: false };
    if (saveStatus === "unsaved") return { tone: "active" as const, text: "Draft changes pending autosave...", elapsedMs: undefined, showStop: false };
    if (generation.agentRun?.status === "success") return { tone: "success" as const, text: generation.agentRun.summary ?? "Concept generation complete.", elapsedMs: typeof generation.agentRun.endedAt === "number" ? generation.agentRun.endedAt - generation.agentRun.startedAt : undefined, showStop: false };
    if (generation.agentRun?.status === "cancelled") return { tone: "error" as const, text: generation.agentRun.summary ?? "Generation stopped.", elapsedMs: typeof generation.agentRun.endedAt === "number" ? generation.agentRun.endedAt - generation.agentRun.startedAt : undefined, showStop: false };
    if (publishMessage) return { tone: "success" as const, text: publishMessage, elapsedMs: undefined, showStop: false };
    if (shareUrl) return { tone: "success" as const, text: "Share link created.", elapsedMs: undefined, showStop: false };
    if (isPostedPost) return { tone: "success" as const, text: "Posted posts are locked. Duplicate this post to make changes.", elapsedMs: undefined, showStop: false };
    return { tone: "idle" as const, text: "Ready. Upload assets and generate concepts.", elapsedMs: undefined, showStop: false };
  }, [generation.agentRun, generation.error, generation.isGenerating, generation.runClock, isPostedPost, isPublishing, isRefining, isSharing, isUploadingAssets, publishMessage, saveStatus, shareUrl]);

  const uploadFileToStorage = async (
    file: File,
    folder: string,
    signal?: AbortSignal,
  ) => {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", folder);
    const r = await fetch("/api/assets/upload", { method: "POST", body: fd, signal });
    if (!r.ok) throw new Error(await parseApiError(r));
    const j = (await r.json()) as { url?: string };
    if (!j.url) throw new Error("Storage did not return a URL");
    return j.url;
  };

  const handleAssetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const postId = activePostIdRef.current;
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!postId || !selected.length || activePostStatusRef.current === "posted") return;
    generation.setError(null);
    setPublishMessageState((current) => current.postId === postId ? { postId, text: null } : current);
    const remaining = 20 - localAssets.length;
    if (remaining <= 0) return;
    const files = selected.slice(0, remaining);
    const staged = files.map((file, i) => ({ id: `${Date.now()}-${i}-${file.name}`, name: file.name, mediaType: mediaTypeFromFile(file), previewUrl: URL.createObjectURL(file), status: "uploading" as const, size: file.size }));
    const uploadController = new AbortController();
    assetUploadAbortRef.current = { postId, controller: uploadController };
    setLocalAssetsForPost(postId, (current) => [...current, ...staged]);
    setUploadingAssetsForPostId(postId);
    try {
      await Promise.allSettled(files.map(async (file, i) => {
        const itemId = staged[i].id;
        if (staged[i].mediaType === "video") {
          try {
            const m = await extractVideoMetadata(staged[i].previewUrl);
            if (uploadController.signal.aborted) {
              revokeObjectUrlIfNeeded(m.posterUrl);
              setLocalAssetsForPost(postId, (current) => {
                const removing = current.find((asset) => asset.id === itemId);
                if (removing) {
                  revokeObjectUrlIfNeeded(removing.previewUrl);
                  if (removing.posterUrl) {
                    revokeObjectUrlIfNeeded(removing.posterUrl);
                  }
                }
                const next = current.filter((asset) => asset.id !== itemId);
                syncAssetsToPost(postId, next);
                return next;
              });
              return;
            }
            setLocalAssetsForPost(postId, (current) => current.map((asset) => asset.id === itemId ? { ...asset, durationSec: m.durationSec, width: m.width, height: m.height, posterUrl: m.posterUrl } : asset));
          } catch {
            setLocalAssetsForPost(postId, (current) => current.map((asset) => asset.id === itemId ? { ...asset, error: "Could not parse video metadata" } : asset));
          }
        }
        try {
          const url = await uploadFileToStorage(file, staged[i].mediaType === "video" ? "videos" : "assets", uploadController.signal);
          setLocalAssetsForPost(postId, (current) => {
            const next = current.map((asset) => asset.id === itemId ? { ...asset, status: "uploaded" as const, storageUrl: url } : asset);
            syncAssetsToPost(postId, next);
            return next;
          });
        } catch (e) {
          if (isAbortError(e)) {
            setLocalAssetsForPost(postId, (current) => {
              const removing = current.find((asset) => asset.id === itemId);
              if (removing) {
                revokeObjectUrlIfNeeded(removing.previewUrl);
                if (removing.posterUrl) {
                  revokeObjectUrlIfNeeded(removing.posterUrl);
                }
              }
              const next = current.filter((asset) => asset.id !== itemId);
              syncAssetsToPost(postId, next);
              return next;
            });
            return;
          }
          setLocalAssetsForPost(postId, (current) => current.map((asset) => asset.id === itemId ? { ...asset, status: "local" as const, error: e instanceof Error ? e.message : "Upload failed" } : asset));
        }
      }));
    } finally {
      if (assetUploadAbortRef.current?.controller === uploadController) {
        assetUploadAbortRef.current = null;
      }
      setUploadingAssetsForPostId((current) => current === postId ? null : current);
    }
  };

  const removeAsset = useCallback((id: string) => {
    if (activePostStatusRef.current === "posted") {
      return;
    }
    const postId = activePostIdRef.current;
    setLocalAssetsForPost(postId, (current) => {
      const removing = current.find((asset) => asset.id === id);
      if (removing) {
        revokeObjectUrlIfNeeded(removing.previewUrl);
        if (removing.posterUrl) {
          revokeObjectUrlIfNeeded(removing.posterUrl);
        }
      }
      const next = current.filter((asset) => asset.id !== id);
      syncAssetsToPost(postId, next);
      return next;
    });
  }, [setLocalAssetsForPost, syncAssetsToPost]);

  const reorderAssets = useCallback((reordered: LocalAsset[]) => {
    if (activePostStatusRef.current === "posted") {
      return;
    }
    const postId = activePostIdRef.current;
    setLocalAssetsForPost(postId, () => {
      syncAssetsToPost(postId, reordered);
      return reordered;
    });
  }, [setLocalAssetsForPost, syncAssetsToPost]);

  const generateRef = useRef<(() => Promise<void>) | null>(null);
  const isAgentBusyRef = useRef(isAgentBusy);
  const localAssetsRef = useRef(localAssets);
  const resultRef = useRef(result);
  isAgentBusyRef.current = isAgentBusy;
  localAssetsRef.current = localAssets;
  resultRef.current = result;
  generateRef.current = generation.generate;

  useEffect(() => {
    const onGenerate = () => {
      if (activePostStatusRef.current === "posted") {
        return;
      }
      if (!isAgentBusyRef.current && localAssetsRef.current.length > 0) void generateRef.current?.();
    };
    const onToggleEditor = () => {
      if (activePostStatusRef.current === "posted") {
        return;
      }
      setEditorMode((v) => !v);
    };
    const onSelectVariant = (e: Event) => {
      if (activePostStatusRef.current === "posted") {
        return;
      }
      const idx = (e as CustomEvent).detail?.index;
      if (typeof idx === "number" && resultRef.current?.variants[idx]) {
        dispatch({ type: "SET_ACTIVE_VARIANT", postId: activePostIdRef.current ?? undefined, variantId: resultRef.current.variants[idx].id });
      }
    };
    const onBeforePostSwitch = (e: Event) => {
      const detail = (e as CustomEvent<{ fromPostId?: string | null; toPostId?: string | null }>).detail;
      const fromPostId = detail?.fromPostId ?? activePostIdRef.current;
      const toPostId = detail?.toPostId ?? null;
      abortUploadsForPostSwitch(fromPostId);
      setPendingGenerateRequest((current) => current && current.postId !== toPostId ? null : current);
      setPendingPublishRequest((current) => current && current.postId !== toPostId ? null : current);
    };
    window.addEventListener("ig:generate", onGenerate);
    window.addEventListener("ig:toggle-editor", onToggleEditor);
    window.addEventListener("ig:select-variant", onSelectVariant);
    window.addEventListener("ig:before-post-switch", onBeforePostSwitch);
    return () => {
      window.removeEventListener("ig:generate", onGenerate);
      window.removeEventListener("ig:toggle-editor", onToggleEditor);
      window.removeEventListener("ig:select-variant", onSelectVariant);
      window.removeEventListener("ig:before-post-switch", onBeforePostSwitch);
    };
  }, [abortUploadsForPostSwitch, dispatch]);

  const renderPosterToDataUrl = useCallback(async () => {
    if (!posterRef.current || !activeVariant) throw new Error("No poster selected");
    return withPerf("toPng", () => toPng(posterRef.current!, { cacheBust: true, pixelRatio: 2 }));
  }, [activeVariant]);
  const renderPosterToPreviewUrl = useCallback(async () => {
    if (!posterRef.current || !activeVariant) throw new Error("No poster selected");
    const blob = await withPerf("toBlob", () =>
      toBlob(posterRef.current!, { cacheBust: true, pixelRatio: 1.5 }));
    if (!blob) {
      throw new Error("Could not render poster preview.");
    }
    return URL.createObjectURL(blob);
  }, [activeVariant]);
  const uploadRenderedPoster = async () => {
    const d = await renderPosterToDataUrl(); const r = await fetch(d); const b = await r.blob();
    return uploadFileToStorage(new File([b], `${slugify(brand.brandName)}-${slugify(post.theme)}-${Date.now()}.png`, { type: "image/png" }), "renders");
  };

  const revokePreviewUrlIfNeeded = useCallback((value: string | null) => {
    if (value?.startsWith("blob:")) {
      URL.revokeObjectURL(value);
    }
  }, []);

  const replacePublishImagePreviewUrl = useCallback((nextUrl: string | null) => {
    const previousUrl = publishImagePreviewBlobUrlRef.current;
    publishImagePreviewBlobUrlRef.current = nextUrl;
    if (previousUrl && previousUrl !== nextUrl) {
      revokePreviewUrlIfNeeded(previousUrl);
    }
    setPublishImagePreviewUrl(nextUrl);
  }, [revokePreviewUrlIfNeeded]);

  useEffect(() => () => {
    revokePreviewUrlIfNeeded(publishImagePreviewBlobUrlRef.current);
    publishImagePreviewBlobUrlRef.current = null;
  }, [revokePreviewUrlIfNeeded]);

  useEffect(() => {
    if (!activeVariant || activeVariant.postType !== "single-image") {
      replacePublishImagePreviewUrl(null);
      return;
    }

    const renderId = publishImagePreviewRenderIdRef.current + 1;
    publishImagePreviewRenderIdRef.current = renderId;
    const timer = window.setTimeout(() => {
      void renderPosterToPreviewUrl()
        .then((previewUrl) => {
          if (publishImagePreviewRenderIdRef.current === renderId) {
            replacePublishImagePreviewUrl(previewUrl);
          } else {
            revokePreviewUrlIfNeeded(previewUrl);
          }
        })
        .catch(() => {
          if (publishImagePreviewRenderIdRef.current === renderId) {
            replacePublishImagePreviewUrl(null);
          }
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeOverlayLayout,
    activeVariant,
    brand.brandName,
    selectedLogo?.previewUrl,
    post.aspectRatio,
    primaryVisual,
    renderPosterToPreviewUrl,
    replacePublishImagePreviewUrl,
      revokePreviewUrlIfNeeded,
    secondaryVisual,
  ]);

  const exportPoster = async () => {
    if (!activeVariant) return;
    try { const d = await renderPosterToDataUrl(); const l = document.createElement("a"); l.href = d; l.download = `${slugify(brand.brandName)}-${slugify(post.theme)}.png`; l.click(); }
    catch (e) { const m = e instanceof Error ? e.message : "Failed to export"; generation.setError(m); toast.error(m); }
  };

  const copyCaption = async () => {
    if (!effectiveCaption) return;
    try { await navigator.clipboard.writeText(effectiveCaption); setCopyState("done"); setTimeout(() => setCopyState("idle"), 1400); } catch { setCopyState("idle"); }
  };

  const refineVariant = async (instruction?: string) => {
    const postId = activePostIdRef.current;
    const inst = instruction?.trim();
    if (!activeVariant || !inst || activePostStatusRef.current === "posted") return;
    const variantForRefine = activeOverlayLayout
      ? {
          ...activeVariant,
          hook: activeOverlayLayout.hook.text.trim() || activeVariant.hook,
          headline:
            activeOverlayLayout.headline.text.trim() || activeVariant.headline,
          supportingText:
            activeOverlayLayout.supportingText.text.trim() ||
            activeVariant.supportingText,
          cta: activeOverlayLayout.cta.text.trim() || activeVariant.cta,
        }
      : activeVariant;
    setRefiningForPostId(postId); generation.setError(null);
    try {
      const r = await fetch("/api/generate/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variant: variantForRefine, instruction: inst, brand }) });
      if (!r.ok) throw new Error(await parseApiError(r));
      const j = await r.json();
      if (j.source !== "model") throw new Error("Refinement could not be applied.");
      if (!isPostStillActive(postId)) return;
      if (result) {
        const refinedVariant = { ...j.variant, id: activeVariant.id };
        const syncedOverlayLayout = activeOverlayLayout
          ? {
              ...activeOverlayLayout,
              hook: {
                ...activeOverlayLayout.hook,
                text: activeOverlayLayout.hook.text.trim()
                  ? refinedVariant.hook
                  : activeOverlayLayout.hook.text,
              },
              headline: {
                ...activeOverlayLayout.headline,
                text: activeOverlayLayout.headline.text.trim()
                  ? refinedVariant.headline
                  : activeOverlayLayout.headline.text,
              },
              supportingText: {
                ...activeOverlayLayout.supportingText,
                text: activeOverlayLayout.supportingText.text.trim()
                  ? refinedVariant.supportingText
                  : activeOverlayLayout.supportingText.text,
              },
              cta: {
                ...activeOverlayLayout.cta,
                text: activeOverlayLayout.cta.text.trim()
                  ? refinedVariant.cta
                  : activeOverlayLayout.cta.text,
              },
            }
          : undefined;

        dispatch({
          type: "SET_RESULT",
          postId: postId ?? undefined,
          result: {
            ...result,
            variants: result.variants.map((v) =>
              v.id === activeVariant.id ? refinedVariant : v,
            ),
          },
          overlayLayouts: syncedOverlayLayout
            ? { [activeVariant.id]: syncedOverlayLayout }
            : {},
        });
      }
    } catch (e) { if (isPostStillActive(postId)) { const m = e instanceof Error ? e.message : "Refinement failed"; generation.setError(m); toast.error(m); } }
    finally { setRefiningForPostId((current) => current === postId ? null : current); }
  };

  const handleResetTextLayout = useCallback(() => {
    if (!activeVariant || activePostStatusRef.current === "posted") return;
    dispatch({
      type: "UPDATE_OVERLAY",
      postId: activePostIdRef.current ?? undefined,
      variantId: activeVariant.id,
      layout: createDefaultOverlayLayout(activeVariant.layout, { cornerRadius: brand.defaultCornerRadius, bgOpacity: brand.defaultBgOpacity }),
    });
  }, [activeVariant, brand.defaultCornerRadius, brand.defaultBgOpacity, dispatch]);

  const createShareLink = async () => {
    const postId = activePostIdRef.current;
    if (!result || !activeVariant) return;
    generation.setError(null); setSharingForPostId(postId);
    try {
      const pu = await uploadRenderedPoster();
      const r = await fetch("/api/projects/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, post, assets: localAssets.filter((a) => a.storageUrl).map((a) => ({ id: a.id, name: a.name, mediaType: a.mediaType, durationSec: a.durationSec, posterUrl: a.posterUrl, url: a.storageUrl })), logoUrl: selectedLogo?.storageUrl, result, activeVariantId: activeVariant.id, overlayLayouts, mediaComposition, publishSettings, renderedPosterUrl: pu }) });
      if (!r.ok) throw new Error(await parseApiError(r));
      const j = (await r.json()) as { shareUrl?: string }; if (!j.shareUrl) throw new Error("No share link returned");
      if (!isPostStillActive(postId)) return;
      dispatch({ type: "SET_SHARE", postId: postId ?? undefined, shareUrl: j.shareUrl });
      try { await navigator.clipboard.writeText(j.shareUrl); setShareCopyState("done"); setTimeout(() => setShareCopyState("idle"), 1400); } catch { setShareCopyState("idle"); }
    } catch (e) { if (isPostStillActive(postId)) { const m = e instanceof Error ? e.message : "Could not create share link"; generation.setError(m); toast.error(m); } }
    finally { setSharingForPostId((current) => current === postId ? null : current); }
  };

  const publishToInstagram = async (scheduleAt?: string) => {
    const postId = activePostIdRef.current;
    if (activePostStatusRef.current === "posted") {
      const m = "Posted posts are locked. Duplicate the post to publish a new version.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    if (!activeVariant) {
      const m = "Generate and select a variant before posting.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    if (!authStatus.connected) { const m = "Connect an Instagram account before publishing."; generation.setError(m); toast.error(m); return; }
    generation.setError(null); setPublishMessageState((current) => current.postId === postId ? { postId, text: null } : current); setPublishingForPostId(postId);
    try {
      const seq = activeVariant.assetSequence.map((id) => assetMap.get(id)).filter((a): a is LocalAsset => Boolean(a));
      const normalizedFirstComment = publishSettings.firstComment.trim() || undefined;
      const locationId = publishSettings.locationId.trim() || undefined;
      const primaryAssetUserTags = primaryPublishAsset
        ? normalizeUserTags(
            mediaCompositionItemsByAssetId.get(primaryPublishAsset.id)?.userTags,
          )
        : [];
      let media: { mode: string; [key: string]: unknown };
      let userTags: MetaUserTag[] | undefined;
      if (activeVariant.postType === "reel") {
        const ra = seq.find((a) => a.mediaType === "video" && a.storageUrl) ?? localAssets.find((a) => a.mediaType === "video" && a.storageUrl);
        if (!ra?.storageUrl) throw new Error("Reel requires an uploaded video asset.");
        media = {
          mode: "reel",
          videoUrl: ra.storageUrl,
          shareToFeed: publishSettings.reelShareToFeed ?? true,
        };
        userTags = primaryAssetUserTags.length ? primaryAssetUserTags : undefined;
      } else if (activeVariant.postType === "carousel") {
        const items = seq
          .filter((a): a is LocalAsset & { storageUrl: string } => Boolean(a.storageUrl))
          .slice(0, 10)
          .map((a) => {
            const itemUserTags = normalizeUserTags(
              mediaCompositionItemsByAssetId.get(a.id)?.userTags,
            );
            return {
              mediaType: a.mediaType,
              url: a.storageUrl,
              userTags:
                a.mediaType === "image" && itemUserTags.length
                  ? itemUserTags
                  : undefined,
            };
          });
        if (items.length < 2) throw new Error("Carousel needs at least 2 uploaded media assets.");
        media = { mode: "carousel", items };
      } else {
        media = { mode: "image", imageUrl: await uploadRenderedPoster() };
        userTags = primaryAssetUserTags.length ? primaryAssetUserTags : undefined;
      }
      const caption = effectiveCaption;
      const publishAt = scheduleAt
        ? (() => {
            const parsedScheduleAt = parseDateTimeLocalInput(
              scheduleAt,
              localTimeZone,
            );
            if (!parsedScheduleAt) {
              throw new Error(
                `Choose a valid publish time in ${localTimeZone}.`,
              );
            }
            return parsedScheduleAt.toISOString();
          })()
        : undefined;
      const r = await fetch("/api/meta/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, caption, firstComment: normalizedFirstComment, locationId, userTags, media, publishAt, outcomeContext: { variantName: activeVariant.name, postType: activeVariant.postType, caption, hook: activeVariant.hook, hashtags: activeVariant.hashtags, brandName: brand.brandName, score: activeVariant.score } }) });
      if (!r.ok) throw new Error(await parseApiError(r));
      const j = (await r.json()) as {
        status?: string;
        mode?: string;
        publishAt?: string;
        publishId?: string;
        firstCommentStatus?: "posted" | "failed";
        firstCommentWarning?: string;
      };
      if (j.status === "scheduled") {
        const scheduledIso = j.publishAt ?? publishAt;
        const scheduledText = scheduledIso
          ? formatDateTimeInTimeZone(scheduledIso, localTimeZone, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "the selected time";
        const m = normalizedFirstComment
          ? `Scheduled for ${scheduledText} (${localTimeZone}). First comment will post after publish.`
          : `Scheduled for ${scheduledText} (${localTimeZone})`;
        if (!isPostStillActive(postId)) return;
        setPublishMessageState({ postId, text: m });
        setPublishJobsRefreshKey((current) => current + 1);
        toast.success(m);
      }
      else {
        if (j.firstCommentStatus === "failed") {
          const warning = j.firstCommentWarning ?? "Could not post first comment.";
          const m = `Published to Instagram. First comment failed: ${warning}`;
          if (!isPostStillActive(postId)) return;
          setPublishMessageState({ postId, text: m });
          toast.warning(m);
        } else {
          const m = "Published to Instagram successfully.";
          if (!isPostStillActive(postId)) return;
          setPublishMessageState({ postId, text: m });
          toast.success(m);
        }
        dispatch({
          type: "ADD_PUBLISH",
          postId: postId ?? undefined,
          entry: { publishedAt: new Date().toISOString(), igMediaId: j.publishId },
        });
      }
    } catch (e) { if (isPostStillActive(postId)) { const m = e instanceof Error ? e.message : "Instagram publish failed"; generation.setError(m); toast.error(m); } }
    finally { setPublishingForPostId((current) => current === postId ? null : current); }
  };

  const publishToInstagramRef = useRef<(
    scheduleAt?: string,
  ) => Promise<void>>(async () => {});
  publishToInstagramRef.current = publishToInstagram;

  const runGenerateFromQuickAction = useCallback(
    async (options?: { notifyOnMissingAssets?: boolean }): Promise<"started" | "busy" | "missing-assets"> => {
      const notifyOnMissingAssets = options?.notifyOnMissingAssets ?? true;
      if (activePostStatusRef.current === "posted") {
        const m = "Posted posts are locked. Duplicate the post to generate a new version.";
        generation.setError(m);
        toast.error(m);
        return "busy";
      }
      if (isAgentBusyRef.current) return "busy";
      if (localAssetsRef.current.length === 0) {
        if (notifyOnMissingAssets) {
          const m = "Upload assets before generating concepts.";
          generation.setError(m);
          toast.error(m);
        }
        return "missing-assets";
      }
      await generateRef.current?.();
      return "started";
    },
    [generation],
  );

  const getKnownPostStatus = useCallback(
    (postId: string) =>
      activePost?.id === postId
        ? activePost.status
        : posts.find((postSummary) => postSummary.id === postId)?.status,
    [activePost?.id, activePost?.status, posts],
  );

  const requestGenerateForPost = useCallback(async (postId: string) => {
    if (!postId) return;
    if (getKnownPostStatus(postId) === "posted") {
      const m = "Posted posts are locked. Duplicate the post to generate a new version.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    const needsSelection = activePost?.id !== postId;
    const needsHydration = hydratedAssetsPostId !== postId;

    if (needsSelection || needsHydration) {
      setPendingGenerateRequest({ postId });
      if (needsSelection) {
        await selectPost(postId);
      }
      return;
    }

    const outcome = await runGenerateFromQuickAction();
    if (outcome === "started") {
      setPendingGenerateRequest(null);
      return;
    }

    // Keep request queued while waiting for assets or busy state to clear.
    setPendingGenerateRequest({ postId });
  }, [activePost?.id, generation, getKnownPostStatus, hydratedAssetsPostId, runGenerateFromQuickAction, selectPost]);

  const requestPublishForPost = useCallback(async (postId: string, scheduleAt?: string) => {
    if (!postId) return;
    if (getKnownPostStatus(postId) === "posted") {
      const m = "Posted posts are locked. Duplicate the post to publish a new version.";
      generation.setError(m);
      toast.error(m);
      return;
    }
    if (activePost?.id !== postId) {
      setPendingPublishRequest({ postId, scheduleAt });
      await selectPost(postId);
      return;
    }
    await publishToInstagramRef.current(scheduleAt);
  }, [activePost?.id, generation, getKnownPostStatus, selectPost]);

  const handlePublishJobsMutated = useCallback(async (
    postId: string | undefined,
    action: "cancel" | "reschedule" | "edit" | "move-to-draft" | "retry-now",
  ) => {
    if (postId && activePost?.id === postId) {
      dispatch({
        type: "SET_STATUS",
        postId,
        status:
          action === "reschedule" || action === "edit" || action === "retry-now"
            ? "scheduled"
            : "draft",
      });
    }

    await refreshPosts();
  }, [activePost?.id, dispatch, refreshPosts]);

  const handleDuplicatePost = useCallback(async (postId: string) => {
    try {
      await duplicatePost(postId);
      toast.success("Post duplicated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not duplicate post.",
      );
    }
  }, [duplicatePost]);

  const handleMoveScheduledToDraft = useCallback(async () => {
    if (!activePost || activePost.status !== "scheduled") return;

    try {
      const jobsResponse = await fetch(
        "/api/publish-jobs?status=queued,processing&limit=50",
        { cache: "no-store" },
      );
      if (!jobsResponse.ok) {
        throw new Error(await parseApiError(jobsResponse));
      }

      const scheduledJobs = PublishJobListResponseSchema.parse(
        await jobsResponse.json(),
      ).jobs.filter((job) => job.postId === activePost.id);

      if (scheduledJobs.length > 0) {
        setPublishJobsRefreshKey((value) => value + 1);
        const moveResults = await Promise.allSettled(
          scheduledJobs.map(async (job) => {
            const moveResponse = await fetch(`/api/publish-jobs/${job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "move-to-draft" }),
            });
            if (!moveResponse.ok) {
              throw new Error(await parseApiError(moveResponse));
            }
          }),
        );
        const failedMoves = moveResults.filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );

        if (failedMoves.length === 0) {
          await handlePublishJobsMutated(activePost.id, "move-to-draft");
          toast.success("Moved scheduled post back to drafts.");
          return;
        }

        await refreshPosts();

        const movedCount = scheduledJobs.length - failedMoves.length;
        const firstFailure = failedMoves[0]?.reason;
        const failureMessage =
          firstFailure instanceof Error
            ? firstFailure.message
            : "Unknown error";

        if (movedCount > 0) {
          throw new Error(
            `Moved ${movedCount} of ${scheduledJobs.length} scheduled jobs back to drafts. ${failedMoves.length} failed: ${failureMessage}`,
          );
        }

        throw new Error(failureMessage);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not move post to drafts.",
      );
    }
  }, [activePost, handlePublishJobsMutated, refreshPosts]);

  const handleArchiveCurrentPost = useCallback(async () => {
    if (!activePost || activePost.archivedAt) return;

    try {
      await archivePost(activePost.id);
      toast.success(
        activePost.status === "posted" ? "Posted post archived." : "Post archived.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not archive post.",
      );
    }
  }, [activePost, archivePost]);

  const postLifecycleActions = activePost ? (
    <>
      {activeVariant && !isPostedPost ? (
        <Button
          variant="outline"
          onClick={() => setEditorMode((v) => !v)}
          className={cn(editorMode && "border-orange-300/50 bg-orange-500/15 text-orange-100")}
        >
          {editorMode ? (
            <>
              <Save className="h-4 w-4" />
              Save
            </>
          ) : (
            <>
              <Pencil className="h-4 w-4" />
              Edit
            </>
          )}
        </Button>
      ) : null}
      {isScheduledPost ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleMoveScheduledToDraft()}
          disabled={isAgentBusy}
        >
          Move to draft
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleDuplicatePost(activePost.id)}
        disabled={isAgentBusy}
      >
        <Copy className="h-3.5 w-3.5" />
        Duplicate post
      </Button>
      {isPostedPost && !activePost.archivedAt ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleArchiveCurrentPost()}
          disabled={isAgentBusy}
        >
          Archive
        </Button>
      ) : null}
    </>
  ) : null;

  const renderPostedReadOnlySummary = () =>
    isPostedPost ? (
      <div className="space-y-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/5 p-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-emerald-200 uppercase">
            Posted Snapshot
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            This post is already posted. IG Poster locks posted posts because the Meta publishing API flow we use does not support updating published media. Duplicate this post to create a new editable draft.
          </p>
          {latestPublishEntry?.publishedAt ? (
            <p className="mt-2 text-xs text-slate-400">
              Posted{" "}
              {formatDateTimeInTimeZone(latestPublishEntry.publishedAt, localTimeZone, {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              ({localTimeZone})
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
              Brand
            </p>
            <p className="mt-2 text-sm text-white">{brand.brandName}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
              Subject
            </p>
            <p className="mt-2 text-sm text-white">{post.subject}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
              Objective
            </p>
            <p className="mt-2 text-sm text-white">{post.objective}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
              Audience
            </p>
            <p className="mt-2 text-sm text-white">{post.audience}</p>
          </div>
        </div>

        {effectiveCaption ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-300 uppercase">
              Caption Snapshot
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
              {effectiveCaption}
            </p>
          </div>
        ) : null}
      </div>
    ) : null;

  const renderComposerActions = () =>
    isPostedPost ? (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => void exportPoster()} disabled={!activeVariant}>
          <Download className="h-4 w-4" />
          Export PNG
        </Button>
        {postLifecycleActions}
      </div>
    ) : (
      <PostBriefActions llmAuthStatus={llmAuthStatus} isGenerating={generation.isGenerating} isUploadingAssets={isUploadingAssets} hasAssets={localAssets.length > 0} hasResult={!!activeVariant} onGenerate={() => void generation.generate()} onCancelGenerate={generation.stopGeneration} onExportPoster={() => void exportPoster()} extraActions={postLifecycleActions}>
        <div className="w-36">
          <PostBriefAspectRatio aspectRatio={post.aspectRatio} disabled={generation.isGenerating} showLabel={false} onChange={(value) => typedDispatch({ type: "UPDATE_BRIEF", brief: { aspectRatio: value } })} />
        </div>
      </PostBriefActions>
    );

  useEffect(() => {
    if (!pendingGenerateRequest || activePost?.id !== pendingGenerateRequest.postId) {
      return;
    }

    // Wait until this post's assets are hydrated into local state.
    if (hydratedAssetsPostId !== pendingGenerateRequest.postId) {
      return;
    }

    if (isAgentBusy) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      const outcome = await runGenerateFromQuickAction({ notifyOnMissingAssets: false });
      if (cancelled) return;
      if (outcome === "started") {
        setPendingGenerateRequest(null);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [activePost?.id, hydratedAssetsPostId, isAgentBusy, localAssets.length, pendingGenerateRequest, runGenerateFromQuickAction]);

  useEffect(() => {
    if (!pendingGenerateRequest) return;
    const postStillExists = posts.some((postSummary) => postSummary.id === pendingGenerateRequest.postId);
    if (!postStillExists) {
      setPendingGenerateRequest(null);
    }
  }, [pendingGenerateRequest, posts]);

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
              <a href="/settings?tab=brand-kits" className="font-semibold underline">Set up your Brand Kit</a>{" "}
              for better results.
            </div>
          )}
          <div className="mx-4 md:mx-8"><OnboardingChecklist /></div>

          {/* Desktop 3-column layout */}
          <div className="hidden lg:block" style={{ height: "calc(100dvh - 82px)" }}>
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
              <ResizablePanel defaultSize={58} minSize={35}>
                <ScrollArea className="h-full px-4">
                  <div className="space-y-6 py-4">
                    <section className="border-b border-white/10 pb-6">
                      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
                        <div className="min-w-0 max-w-[27rem]">
                          {isPostedPost ? (
                            renderPostedReadOnlySummary()
                          ) : (
                            <PostBriefForm post={post} llmAuthStatus={llmAuthStatus} isGenerating={generation.isGenerating} isUploadingAssets={isUploadingAssets} hasAssets={localAssets.length > 0} hasResult={!!activeVariant} brandKits={brandKits} activeBrandKitId={activePost?.brandKitId} activeLogoUrl={activePost?.logoUrl} compact showHeader={false} showActions={false} showAspectRatio={false} dispatch={typedDispatch} onGenerate={() => void generation.generate()} onCancelGenerate={generation.stopGeneration} onExportPoster={() => void exportPoster()} onSelectBrandKit={(id) => void handleSelectBrandKit(id)} onSelectLogo={handleSelectLogo} />
                          )}
                        </div>
                        <div className="min-w-0 space-y-4">
                          <div className="w-full max-w-[40rem]">
                            {renderComposerActions()}
                          </div>
                          <PosterSection posterRef={posterRef} activeVariant={activeVariant} brandName={brand.brandName} aspectRatio={post.aspectRatio} primaryVisual={primaryVisual} secondaryVisual={secondaryVisual} logoImage={selectedLogo?.previewUrl} editorMode={editorMode && !isPostedPost} onResetTextLayout={handleResetTextLayout} saveStatus={saveStatus} overlayLayout={activeOverlayLayout} activeSlideIndex={activeSlideIndex} previewClassName="max-w-[40rem]" dispatch={typedDispatch} />
                          {activeVariant?.postType === "carousel" && !isPostedPost ? (
                            <CarouselComposer
                              assets={localAssets}
                              assetSequence={carouselComposerSequence}
                              orientation={mediaComposition.orientation}
                              onAssetSequenceChange={handleCarouselComposerSequenceChange}
                              onOrientationChange={handleCarouselOrientationChange}
                              disabled={isAgentBusy}
                            />
                          ) : null}
                        </div>
                      </div>
                    </section>
                    {!isPostedPost ? (
                      <section className="border-b border-white/10 pb-6">
                        <AssetManager assets={localAssets} onRemove={removeAsset} onReorder={reorderAssets} onAssetUpload={(e) => void handleAssetUpload(e)} />
                      </section>
                    ) : null}
                    {result && !isPostedPost ? (
                      <section className="border-b border-white/10 pb-6">
                        <StrategySection result={result} activeVariant={activeVariant} editorMode={editorMode} isRefining={isRefining} dispatch={typedDispatch} captionValue={publishSettings.caption} onCaptionChange={(value) => updatePublishSettings({ caption: value })} onUseGeneratedCaption={() => updatePublishSettings({ caption: generatedCaptionBundle })} onRefineVariant={(inst) => void refineVariant(inst)} onCopyCaption={() => void copyCaption()} copyState={copyState} overlayLayout={activeOverlayLayout} onOverlayLayoutChange={(layout) => {
                          if (!activeVariant) return;
                          dispatch({
                            type: "UPDATE_OVERLAY",
                            variantId: activeVariant.id,
                            layout,
                          });
                        }} saveStatus={saveStatus} onSaveNow={saveNow} />
                      </section>
                    ) : null}
                    {activeVariant && !isPostedPost ? (
                      <section className="pb-6">
                        <div className="space-y-4">
                          <PublishMetadataEditor postType={activeVariant.postType} firstComment={publishSettings.firstComment} locationId={publishSettings.locationId} reelShareToFeed={publishSettings.reelShareToFeed} hasIncompleteUserTags={hasIncompletePublishUserTags} singleTagAsset={singlePublishTagAsset} carouselTagAssets={carouselTagAssets} onFirstCommentChange={(value) => updatePublishSettings({ firstComment: value })} onLocationIdChange={(value) => updatePublishSettings({ locationId: value })} onReelShareToFeedChange={(value) => updatePublishSettings({ reelShareToFeed: value })} onAssetUserTagsChange={updateAssetUserTags} disabled={isAgentBusy} />
                          <PublishSection activePostId={activePost?.id} authStatus={authStatus} isAuthLoading={isAuthLoading} isSharing={isSharing} isPublishing={isPublishing} hasBlockingValidationError={hasIncompletePublishUserTags} validationMessage={hasIncompletePublishUserTags ? "Fix incomplete user tag rows before posting or scheduling." : null} onPublishJobsMutated={handlePublishJobsMutated} publishJobsRefreshKey={publishJobsRefreshKey} shareUrl={shareUrl} shareCopyState={shareCopyState} localTimeZone={localTimeZone}onCreateShareLink={() => void createShareLink()} onPostNow={() => void publishToInstagram()} onSchedulePost={(scheduleAt) => void publishToInstagram(scheduleAt)} onSelectPlannerPost={(postId) => selectPost(postId)} />
                        </div>
                      </section>
                    ) : null}
                  </div>
                </ScrollArea>
              </ResizablePanel>
              <ResizableHandle withHandle className="mx-1 bg-white/5 hover:bg-white/10" />
              <ResizablePanel panelRef={rightPanelRef} defaultSize={24} minSize={18} collapsible collapsedSize={0} onResize={(size) => setRightCollapsed(size.asPercentage === 0)} className="flex flex-col">
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
            {isPostedPost ? (
              renderPostedReadOnlySummary()
            ) : (
              <PostBriefForm post={post} llmAuthStatus={llmAuthStatus} isGenerating={generation.isGenerating} isUploadingAssets={isUploadingAssets} hasAssets={localAssets.length > 0} hasResult={!!activeVariant} brandKits={brandKits} activeBrandKitId={activePost?.brandKitId} activeLogoUrl={activePost?.logoUrl} dispatch={typedDispatch} onGenerate={() => void generation.generate()} onCancelGenerate={generation.stopGeneration} onExportPoster={() => void exportPoster()} onSelectBrandKit={(id) => void handleSelectBrandKit(id)} onSelectLogo={handleSelectLogo} extraActions={postLifecycleActions} />
            )}
            {isPostedPost ? (
              renderComposerActions()
            ) : (
              <AssetManager assets={localAssets} onRemove={removeAsset} onReorder={reorderAssets} onAssetUpload={(e) => void handleAssetUpload(e)} />
            )}
            <PosterSection posterRef={posterRef} activeVariant={activeVariant} brandName={brand.brandName} aspectRatio={post.aspectRatio} primaryVisual={primaryVisual} secondaryVisual={secondaryVisual} logoImage={selectedLogo?.previewUrl} editorMode={editorMode && !isPostedPost} onResetTextLayout={handleResetTextLayout} saveStatus={saveStatus} overlayLayout={activeOverlayLayout} activeSlideIndex={activeSlideIndex} dispatch={typedDispatch} />
            {activeVariant?.postType === "carousel" && !isPostedPost ? (
              <CarouselComposer
                assets={localAssets}
                assetSequence={carouselComposerSequence}
                orientation={mediaComposition.orientation}
                onAssetSequenceChange={handleCarouselComposerSequenceChange}
                onOrientationChange={handleCarouselOrientationChange}
                disabled={isAgentBusy}
              />
            ) : null}
            {result && !isPostedPost ? <StrategySection result={result} activeVariant={activeVariant} editorMode={editorMode} isRefining={isRefining} dispatch={typedDispatch} captionValue={publishSettings.caption} onCaptionChange={(value) => updatePublishSettings({ caption: value })} onUseGeneratedCaption={() => updatePublishSettings({ caption: generatedCaptionBundle })} onRefineVariant={(inst) => void refineVariant(inst)} onCopyCaption={() => void copyCaption()} copyState={copyState} overlayLayout={activeOverlayLayout} onOverlayLayoutChange={(layout) => {
              if (!activeVariant) return;
              dispatch({
                type: "UPDATE_OVERLAY",
                variantId: activeVariant.id,
                layout,
              });
            }} saveStatus={saveStatus} onSaveNow={saveNow} /> : null}
            {activeVariant && !isPostedPost ? (
              <div className="space-y-4">
                <PublishMetadataEditor postType={activeVariant.postType} firstComment={publishSettings.firstComment} locationId={publishSettings.locationId} reelShareToFeed={publishSettings.reelShareToFeed} hasIncompleteUserTags={hasIncompletePublishUserTags} singleTagAsset={singlePublishTagAsset} carouselTagAssets={carouselTagAssets} onFirstCommentChange={(value) => updatePublishSettings({ firstComment: value })} onLocationIdChange={(value) => updatePublishSettings({ locationId: value })} onReelShareToFeedChange={(value) => updatePublishSettings({ reelShareToFeed: value })} onAssetUserTagsChange={updateAssetUserTags} disabled={isAgentBusy} />
                <PublishSection activePostId={activePost?.id} authStatus={authStatus} isAuthLoading={isAuthLoading} isSharing={isSharing} isPublishing={isPublishing} hasBlockingValidationError={hasIncompletePublishUserTags} validationMessage={hasIncompletePublishUserTags ? "Fix incomplete user tag rows before posting or scheduling." : null} onPublishJobsMutated={handlePublishJobsMutated} publishJobsRefreshKey={publishJobsRefreshKey} shareUrl={shareUrl} shareCopyState={shareCopyState} localTimeZone={localTimeZone}onCreateShareLink={() => void createShareLink()} onPostNow={() => void publishToInstagram()} onSchedulePost={(scheduleAt) => void publishToInstagram(scheduleAt)} onSelectPlannerPost={(postId) => selectPost(postId)} />
              </div>
            ) : null}
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
          </div>
        </div>
      </div>

    </>
  );
}
