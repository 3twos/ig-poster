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
import { useState, type ChangeEvent } from "react";

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
  logo: LocalAsset | null;
  onRemove: (id: string) => void;
  onReorder: (reordered: LocalAsset[]) => void;
  onAssetUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function AssetManager({
  assets,
  logo,
  onRemove,
  onReorder,
  onAssetUpload,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  if (assets.length === 0 && !logo) {
    return null;
  }

  const activeAsset = activeId ? assets.find((a) => a.id === activeId) : null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.2em] text-slate-300 uppercase">
        Assets
      </p>

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
          <div className="grid grid-cols-3 gap-2">
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

            {/* Add more assets tile */}
            <label className="group flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/5 text-slate-400 transition hover:border-orange-300 hover:text-slate-200">
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px] font-medium">Add</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={onAssetUpload}
              />
            </label>
          </div>
        </SortableContext>

        <DragOverlay>
          {activeAsset ? <AssetTileContent asset={activeAsset} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* Logo (not sortable) */}
      {logo ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo.previewUrl}
            alt="Logo"
            className="h-10 w-10 rounded object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-200">
              Logo: {logo.name}
            </p>
            <p className="text-[10px] text-slate-500">
              {logo.status === "uploading" ? "syncing..." : logo.status}
            </p>
          </div>
        </div>
      ) : null}
    </div>
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
        className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition hover:bg-red-400 group-hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>

      {/* Reorder arrows — bottom corners, one-click */}
      {total > 1 && (
        <div className="absolute inset-x-0 bottom-1 z-10 flex justify-between px-1 opacity-0 transition group-hover:opacity-100">
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
        <span className="absolute left-1.5 top-1.5 z-[5] flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white group-hover:opacity-0 transition">
          {index + 1}
        </span>
      )}
    </div>
  );
}
