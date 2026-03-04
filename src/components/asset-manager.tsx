"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Film,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  X,
} from "lucide-react";
import type { ChangeEvent } from "react";

import type { LocalAsset } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDuration, statusChip } from "@/lib/upload-helpers";

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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = assets.findIndex((a) => a.id === active.id);
    const newIndex = assets.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(assets, oldIndex, newIndex));
  };

  if (assets.length === 0 && !logo) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-[0.2em] text-slate-300 uppercase">
        Assets
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={assets.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {assets.map((asset) => (
              <SortableAssetItem
                key={asset.id}
                asset={asset}
                onRemove={() => onRemove(asset.id)}
              />
            ))}
          </div>
        </SortableContext>
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

      {/* Add more assets */}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 px-3 py-2 text-xs text-slate-400 transition hover:border-orange-300 hover:text-slate-200">
        <ImagePlus className="h-3.5 w-3.5" />
        Add assets
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={onAssetUpload}
        />
      </label>
    </div>
  );
}

function SortableAssetItem({
  asset,
  onRemove,
}: {
  asset: LocalAsset;
  onRemove: () => void;
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5",
        statusChip(asset.status),
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 cursor-grab text-slate-500 hover:text-slate-300 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Thumbnail */}
      {asset.previewUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={asset.posterUrl || asset.previewUrl}
          alt={asset.name}
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10">
          {asset.mediaType === "video" ? (
            <Film className="h-4 w-4 text-slate-400" />
          ) : (
            <ImageIcon className="h-4 w-4 text-slate-400" />
          )}
        </div>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-200">
          {asset.name}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {asset.mediaType === "video" ? (
            <Film className="h-3 w-3" />
          ) : (
            <ImageIcon className="h-3 w-3" />
          )}
          {asset.size ? <span>{formatFileSize(asset.size)}</span> : null}
          {asset.mediaType === "video" && asset.durationSec ? (
            <span>{formatDuration(asset.durationSec)}</span>
          ) : null}
          {asset.status === "uploading" ? <span>syncing...</span> : null}
          {asset.status === "local" ? <span>local only</span> : null}
          {asset.error ? <span className="text-red-400">{asset.error}</span> : null}
        </div>
      </div>

      {/* Status dot */}
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          asset.status === "uploaded"
            ? "bg-emerald-400"
            : asset.status === "uploading"
              ? "bg-blue-400 animate-pulse"
              : asset.status === "failed"
                ? "bg-red-400"
                : "bg-yellow-400",
        )}
      />

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 text-slate-500 hover:text-red-400 transition"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
