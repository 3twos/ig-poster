"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  Film,
  Image as ImageIcon,
  ImagePlus,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useCallback,
  type ChangeEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  APPLE_PHOTOS_INSTALL_COMMAND,
  ApplePhotosBridgeRequestError,
  getApplePhotosFallbackInfo,
  isMacOsUserAgent,
  openApplePhotosCompanion,
  probeApplePhotosBridge,
  type ApplePhotosFallbackInfo,
} from "@/lib/apple-photos";
import type { LocalAsset } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/upload-helpers";

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type Props = {
  assets: LocalAsset[];
  onRemove: (id: string) => void;
  onReorder: (reordered: LocalAsset[]) => void;
  onAssetUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onApplePhotosImport: () => Promise<void>;
  draftId?: string;
  profile?: string;
};

type ApplePhotosDialogState =
  | {
      kind: "fallback";
      info: ApplePhotosFallbackInfo;
    }
  | {
      kind: "launch";
      bridgeOrigin: string;
      launchUrl: string;
      launchMode: "bridge" | "legacy-url";
      selectionAssetCount: number;
    };

type ApplePhotosImportSession = {
  launchedAt: number;
};

const subscribeToClientStatus = () => () => {};

export function AssetManager({
  assets,
  onRemove,
  onReorder,
  onAssetUpload,
  onApplePhotosImport,
  draftId,
  profile,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [applePhotosDialogOpen, setApplePhotosDialogOpen] = useState(false);
  const [applePhotosDialogState, setApplePhotosDialogState] =
    useState<ApplePhotosDialogState | null>(null);
  const [applePhotosProbePending, setApplePhotosProbePending] = useState(false);
  const [applePhotosImportPending, setApplePhotosImportPending] =
    useState(false);
  const [applePhotosOpenPending, setApplePhotosOpenPending] = useState(false);
  const [applePhotosImportSession, setApplePhotosImportSession] =
    useState<ApplePhotosImportSession | null>(null);
  const addAssetInputId = useId();
  const addAssetInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const isClient = useSyncExternalStore(
    subscribeToClientStatus,
    () => true,
    () => false,
  );
  const userAgent = isClient ? window.navigator.userAgent : "";
  const showApplePhotosEntry = isMacOsUserAgent(userAgent);
  const applePhotosBusy =
    applePhotosProbePending ||
    applePhotosOpenPending ||
    applePhotosImportPending ||
    applePhotosImportSession !== null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = assets.findIndex((a) => a.id === active.id);
    const newIndex = assets.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(assets, oldIndex, newIndex));
  };

  const moveAsset = (id: string, direction: -1 | 1) => {
    const idx = assets.findIndex((a) => a.id === id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= assets.length) return;
    onReorder(arrayMove(assets, idx, target));
  };

  const activeAsset = activeId ? assets.find((a) => a.id === activeId) : null;
  const handleUseRegularUpload = useCallback(() => {
    const input = addAssetInputRef.current;
    if (input) {
      input.click();
    }
    setApplePhotosDialogOpen(false);
    setApplePhotosDialogState(null);
    setApplePhotosImportSession(null);
  }, []);

  const handleApplePhotosBridgeImportError = useCallback((error: unknown) => {
    const fallbackCode =
      error instanceof ApplePhotosBridgeRequestError &&
      error.code === "MACOS_COMPANION_REQUIRED"
        ? "MACOS_COMPANION_REQUIRED"
        : "MACOS_BRIDGE_UNAVAILABLE";

    setApplePhotosDialogState({
      kind: "fallback",
      info: {
        ...getApplePhotosFallbackInfo(userAgent, fallbackCode),
        description:
          error instanceof Error
            ? error.message
            : "The local Apple Photos bridge could not hand the selected files back to this draft yet.",
      },
    });
    setApplePhotosDialogOpen(true);
  }, [userAgent]);

  const handleImportCurrentSelection = useCallback(async () => {
    setApplePhotosImportPending(true);

    try {
      await onApplePhotosImport();
      setApplePhotosDialogOpen(false);
      setApplePhotosDialogState(null);
      setApplePhotosImportSession(null);
    } catch (error) {
      handleApplePhotosBridgeImportError(error);
    } finally {
      setApplePhotosImportPending(false);
    }
  }, [handleApplePhotosBridgeImportError, onApplePhotosImport]);

  const handleAddFromPhotos = async () => {
    if (!showApplePhotosEntry || applePhotosBusy) return;

    setApplePhotosProbePending(true);
    const probe = await probeApplePhotosBridge({
      returnTo: window.location.href,
      draftId,
      profile,
    });
    setApplePhotosProbePending(false);

    if (probe.available) {
      const selectionAssetCount = probe.health.selection?.assetCount ?? 0;
      const companionInstalled = probe.health.companionApp?.installed;
      const launchMode =
        probe.health.companionApp && probe.health.bridge.openCompanionUrl
          ? "bridge"
          : "legacy-url";

      if (selectionAssetCount <= 0 && companionInstalled === false) {
        setApplePhotosDialogState({
          kind: "fallback",
          info: getApplePhotosFallbackInfo(userAgent, "MACOS_COMPANION_REQUIRED"),
        });
        setApplePhotosDialogOpen(true);
        return;
      }

      setApplePhotosDialogState({
        kind: "launch",
        bridgeOrigin: probe.health.bridge.origin,
        launchUrl: probe.launchUrl,
        launchMode,
        selectionAssetCount,
      });
      setApplePhotosDialogOpen(true);
      return;
    }

    setApplePhotosDialogState({
      kind: "fallback",
      info: getApplePhotosFallbackInfo(userAgent, probe.code),
    });
    setApplePhotosDialogOpen(true);
  };

  const handleOpenCompanion = async () => {
    if (applePhotosDialogState?.kind !== "launch") return;

    setApplePhotosOpenPending(true);

    try {
      if (applePhotosDialogState.launchMode === "legacy-url") {
        setApplePhotosImportSession({
          launchedAt: Date.now(),
        });
        setApplePhotosDialogOpen(false);
        setApplePhotosDialogState(null);
        window.location.assign(applePhotosDialogState.launchUrl);
        return;
      }

      const launch = await openApplePhotosCompanion({
        bridgeOrigin: applePhotosDialogState.bridgeOrigin,
        returnTo: window.location.href,
        draftId,
        profile,
      });
      const launchedAt = Date.parse(launch.launchedAt);

      setApplePhotosImportSession({
        launchedAt: Number.isNaN(launchedAt) ? Date.now() : launchedAt,
      });
      setApplePhotosDialogOpen(false);
      setApplePhotosDialogState(null);
    } catch (error) {
      handleApplePhotosBridgeImportError(error);
    } finally {
      setApplePhotosOpenPending(false);
    }
  };

  useEffect(() => {
    if (!applePhotosImportSession) return;

    let active = true;
    const timeoutId = window.setTimeout(() => {
      if (active) {
        setApplePhotosImportSession(null);
      }
    }, 120_000);

    const pollForImportedSelection = async () => {
      const probe = await probeApplePhotosBridge({
        returnTo: window.location.href,
        draftId,
        profile,
      });

      if (!active || !probe.available) return;

      const selection = probe.health.selection;
      if (!selection || selection.assetCount <= 0) return;

      const updatedAt = Date.parse(selection.updatedAt);
      if (Number.isNaN(updatedAt) || updatedAt < applePhotosImportSession.launchedAt) {
        return;
      }

      setApplePhotosImportSession(null);
      await handleImportCurrentSelection();
    };

    void pollForImportedSelection();
    const intervalId = window.setInterval(() => {
      void pollForImportedSelection();
    }, 1_500);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [
    applePhotosImportSession,
    draftId,
    handleImportCurrentSelection,
    profile,
  ]);

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-slate-300 uppercase">
              Assets
            </p>
            <div className="flex items-center gap-2">
              {showApplePhotosEntry ? (
                <button
                  type="button"
                  disabled={applePhotosBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/8 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-orange-300 hover:bg-white/12"
                  onClick={handleAddFromPhotos}
                >
                  <ImageIcon className="h-3.5 w-3.5 text-orange-300" />
                  {applePhotosOpenPending
                    ? "Opening Photos..."
                    : applePhotosImportPending
                    ? "Importing Photos..."
                    : applePhotosImportSession
                      ? "Waiting for Photos..."
                      : applePhotosProbePending
                        ? "Checking Photos..."
                        : "Add from Photos"}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/25 bg-black/20 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-orange-300"
                onClick={() => addAssetInputRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5 text-orange-300" />
                {assets.length > 0 ? "Add assets" : "Attach assets"}
              </button>
            </div>
            <input
              id={addAssetInputId}
              ref={addAssetInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              onChange={onAssetUpload}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Upload images and short videos for generation.
          </p>
          {showApplePhotosEntry ? (
            <p className="mt-1 text-[11px] text-slate-500">
              Pick photos directly from your Apple Photos library. Requires the companion bridge — run <code className="font-mono text-orange-300/70">{APPLE_PHOTOS_INSTALL_COMMAND}</code> once to set up.
            </p>
          ) : null}
          {applePhotosImportSession ? (
            <p className="mt-1 text-[11px] text-orange-200">
              Waiting for IG Poster Companion to finish exporting the current Photos selection...
            </p>
          ) : null}

          {assets.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e) => setActiveId(String(e.active.id))}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext
                items={assets.map((a) => a.id)}
                strategy={rectSortingStrategy}
              >
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {assets.map((asset, idx) => (
                    <SortableAssetTile
                      key={asset.id}
                      asset={asset}
                      index={idx}
                      total={assets.length}
                      onRemove={() => onRemove(asset.id)}
                      onMove={(dir) => moveAsset(asset.id, dir)}
                    />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay>
                {activeAsset ? (
                  <AssetTileContent asset={activeAsset} isDragOverlay />
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400">
              No assets attached.
            </p>
          )}
        </div>
      </div>

      <Dialog
        open={applePhotosDialogOpen}
        onOpenChange={(nextOpen) => {
          setApplePhotosDialogOpen(nextOpen);
          if (!nextOpen) {
            setApplePhotosDialogState(null);
          }
        }}
      >
        <DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {applePhotosDialogState?.kind === "launch"
                ? applePhotosDialogState.selectionAssetCount > 0
                  ? "Import from IG Poster Companion"
                  : "Open IG Poster Companion"
                : applePhotosDialogState?.info.title}
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              {applePhotosDialogState?.kind === "launch"
                ? applePhotosDialogState.selectionAssetCount > 0
                  ? "The local Apple Photos bridge already has a bridge-ready selection waiting. Import it now, open the companion to change the selection, or stay here and use regular upload instead."
                  : "A local Apple Photos bridge is responding on this Mac. Open the native companion to continue with Photos selection, or stay here and use regular upload instead."
                : applePhotosDialogState?.info.description}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
            <span className="font-semibold text-slate-100">Status:</span>{" "}
            <code className="font-mono text-[10px] text-orange-200">
              {applePhotosDialogState?.kind === "launch"
                ? "MACOS_BRIDGE_AVAILABLE"
                : applePhotosDialogState?.info.code}
            </code>
          </div>
          {applePhotosDialogState?.kind === "fallback" &&
            applePhotosDialogState.info.installHint ? (
            <div className="rounded-lg border border-orange-400/20 bg-orange-950/30 px-3 py-2.5 text-[11px] text-slate-200">
              <p className="mb-1.5 font-semibold text-orange-200">Quick setup</p>
              <p className="mb-2 text-slate-300">
                Run this in your project directory:
              </p>
              <code className="block rounded bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-orange-100 select-all">
                {applePhotosDialogState.info.installHint}
              </code>
              <p className="mt-2 text-[10px] text-slate-400">
                Builds the companion, installs the bridge, and registers a LaunchAgent so it auto-starts at login.
              </p>
            </div>
          ) : null}
          {applePhotosDialogState?.kind === "launch" ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
              <span className="font-semibold text-slate-100">Bridge:</span>{" "}
              <code className="font-mono text-[10px] text-orange-200">
                {applePhotosDialogState.bridgeOrigin}
              </code>
            </div>
          ) : null}
          {applePhotosDialogState?.kind === "launch" ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
              <span className="font-semibold text-slate-100">Ready assets:</span>{" "}
              <code className="font-mono text-[10px] text-orange-200">
                {applePhotosDialogState.selectionAssetCount}
              </code>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApplePhotosDialogOpen(false);
                setApplePhotosDialogState(null);
              }}
            >
              Not now
            </Button>
            <Button
              className="bg-orange-300 text-slate-950 hover:bg-orange-200"
              onClick={
                applePhotosDialogState?.kind === "launch"
                  ? applePhotosDialogState.selectionAssetCount > 0
                    ? () => void handleImportCurrentSelection()
                    : () => void handleOpenCompanion()
                  : handleUseRegularUpload
              }
              disabled={applePhotosImportPending || applePhotosOpenPending}
            >
              {applePhotosDialogState?.kind === "launch"
                ? applePhotosDialogState.selectionAssetCount > 0
                  ? applePhotosImportPending
                    ? "Importing..."
                    : "Import selection"
                  : applePhotosOpenPending
                    ? "Opening..."
                    : "Open companion"
                : applePhotosDialogState?.info.actionLabel}
            </Button>
            {applePhotosDialogState?.kind === "launch" ? (
              <>
                {applePhotosDialogState.selectionAssetCount > 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleOpenCompanion()}
                    disabled={applePhotosOpenPending}
                  >
                    {applePhotosOpenPending ? "Opening..." : "Open companion"}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={handleUseRegularUpload}>
                  Use regular upload
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssetTileContent({
  asset,
  isDragOverlay,
}: {
  asset: LocalAsset;
  isDragOverlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-xl border bg-white/5",
        isDragOverlay
          ? "border-orange-400 shadow-lg shadow-orange-500/20"
          : "border-white/10",
      )}
    >
      {asset.previewUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={asset.posterUrl || asset.previewUrl}
          alt={asset.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-white/10">
          {asset.mediaType === "video" ? (
            <Film className="h-6 w-6 text-slate-400" />
          ) : (
            <ImageIcon className="h-6 w-6 text-slate-400" />
          )}
        </div>
      )}

      {/* Status indicator */}
      <span
        className={cn(
          "absolute bottom-1.5 left-1.5 z-10 h-2 w-2 rounded-full ring-1 ring-black/30",
          asset.status === "uploaded"
            ? "bg-emerald-400"
            : asset.status === "uploading"
              ? "bg-blue-400 animate-pulse"
              : asset.status === "failed"
                ? "bg-red-400"
                : "bg-yellow-400",
        )}
      />

      {/* Video badge */}
      {asset.mediaType === "video" && (
        <span className="absolute bottom-1 right-1.5 z-10 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white">
          <Film className="h-2.5 w-2.5" />
          {asset.durationSec ? formatDuration(asset.durationSec) : ""}
        </span>
      )}

      {/* File info overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-4">
        <p className="truncate text-[10px] font-medium text-white/90">
          {asset.name}
        </p>
        {asset.size ? (
          <p className="text-[9px] text-white/50">{formatFileSize(asset.size)}</p>
        ) : null}
      </div>
    </div>
  );
}

function SortableAssetTile({
  asset,
  index,
  total,
  onRemove,
  onMove,
}: {
  asset: LocalAsset;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <AssetTileContent asset={asset} />
      </div>

      {/* Remove button — top right */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-100 shadow transition hover:bg-red-400 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Reorder arrows — bottom corners, one-click */}
      {total > 1 && (
        <div className="absolute inset-x-0 bottom-1 z-10 flex justify-between px-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move left"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 disabled:invisible"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move right"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 disabled:invisible"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Position badge */}
      {total > 1 && (
        <span className="absolute left-1.5 top-1.5 z-[5] flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white transition md:group-hover:opacity-0 md:group-focus-within:opacity-0">
          {index + 1}
        </span>
      )}
    </div>
  );
}
