"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ComposerOrientation } from "@/lib/media-composer";
import type { LocalAsset } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  assets: LocalAsset[];
  assetSequence: string[];
  orientation: ComposerOrientation;
  onAssetSequenceChange: (assetIds: string[]) => void;
  onOrientationChange: (orientation: ComposerOrientation) => void;
  disabled?: boolean;
};

const ORIENTATION_OPTIONS: Array<{
  value: ComposerOrientation;
  label: string;
  icon: typeof Square;
}> = [
  { value: "square", label: "Square", icon: Square },
  {
    value: "portrait",
    label: "Portrait",
    icon: RectangleVertical,
  },
  {
    value: "landscape",
    label: "Landscape",
    icon: RectangleHorizontal,
  },
];

export function CarouselComposer({
  assets,
  assetSequence,
  orientation,
  onAssetSequenceChange,
  onOrientationChange,
  disabled = false,
}: Props) {
  /* Internal sequence used while dragging so parent re-renders (auto-save)
     cannot reset positions mid-drag. Committed to parent only on drop. */
  const [dragSequence, setDragSequence] = useState<string[] | null>(null);
  const activeSeq = dragSequence ?? assetSequence;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const includedAssets = activeSeq
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is LocalAsset => Boolean(asset));
  const availableAssets = assets.filter(
    (asset) => !activeSeq.includes(asset.id),
  );
  const canAdd = includedAssets.length < 10;
  const canRemove = includedAssets.length > 2;

  const handleDragStart = useCallback(
    () => setDragSequence([...assetSequence]),
    [assetSequence],
  );

  const handleDragOver = useCallback(
    (event: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const seq = dragSequence ?? assetSequence;
      const oldIdx = seq.indexOf(String(active.id));
      const newIdx = seq.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;
      setDragSequence(arrayMove(seq, oldIdx, newIdx));
    },
    [dragSequence, assetSequence],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const seq = dragSequence ?? assetSequence;
      if (over && active.id !== over.id) {
        const oldIdx = seq.indexOf(String(active.id));
        const newIdx = seq.indexOf(String(over.id));
        if (oldIdx !== -1 && newIdx !== -1) {
          onAssetSequenceChange(arrayMove(seq, oldIdx, newIdx));
        }
      } else if (dragSequence) {
        // Commit whatever intermediate order we have
        onAssetSequenceChange(dragSequence);
      }
      setDragSequence(null);
    },
    [dragSequence, assetSequence, onAssetSequenceChange],
  );

  const handleDragCancel = useCallback(() => setDragSequence(null), []);

  return (
    <div className="rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
            Carousel Composer
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Preview, share, schedule, and publish use this order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ORIENTATION_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                size="xs"
                disabled={disabled}
                onClick={() => onOrientationChange(option.value)}
                className={cn(
                  "min-w-[96px]",
                  orientation === option.value &&
                    "border-orange-300/50 bg-orange-500/15 text-orange-100",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
            Included
          </p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={includedAssets.map((asset) => asset.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-3 overflow-x-auto pb-1">
              {includedAssets.map((asset, i) => (
                <SortableComposerTile
                  key={asset.id}
                  asset={asset}
                  index={i}
                  total={includedAssets.length}
                  removable={canRemove}
                  disabled={disabled}
                  onMoveLeft={() => {
                    const idx = activeSeq.indexOf(asset.id);
                    if (idx <= 0) return;
                    onAssetSequenceChange(
                      arrayMove(activeSeq, idx, idx - 1),
                    );
                  }}
                  onMoveRight={() => {
                    const idx = activeSeq.indexOf(asset.id);
                    if (idx === -1 || idx >= activeSeq.length - 1) return;
                    onAssetSequenceChange(
                      arrayMove(activeSeq, idx, idx + 1),
                    );
                  }}
                  onRemove={() => {
                    if (!canRemove) return;
                    onAssetSequenceChange(
                      activeSeq.filter((id) => id !== asset.id),
                    );
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {includedAssets.length < 2 ? (
          <p className="mt-2 text-[11px] text-amber-200">
            Carousel posts need at least 2 included items.
          </p>
        ) : null}
      </div>

      {availableAssets.length ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
              Available Assets
            </p>
            <p className="text-[11px] text-slate-500">
              {canAdd ? "Add up to 10 items" : "Carousel limit reached"}
            </p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {availableAssets.map((asset) => (
              <ComposerTile
                key={asset.id}
                asset={asset}
                disabled={disabled || !canAdd}
                actionLabel="Add"
                onAction={() => {
                  if (!canAdd) return;
                  onAssetSequenceChange([...activeSeq, asset.id]);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---- Tile ---- */

function ComposerTile({
  asset,
  removable = false,
  disabled = false,
  isDragging = false,
  actionLabel,
  onAction,
  onMoveLeft,
  onMoveRight,
  index,
  total,
  onRemove,
}: {
  asset: LocalAsset;
  removable?: boolean;
  disabled?: boolean;
  isDragging?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  index?: number;
  total?: number;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "w-28 shrink-0 rounded-xl border border-white/10 bg-black/20 p-1.5 select-none transition-shadow",
        isDragging &&
          "z-10 scale-[1.04] border-orange-300/50 shadow-xl shadow-orange-500/20",
      )}
    >
      <div className="relative overflow-hidden rounded-lg">
        {asset.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.posterUrl || asset.previewUrl}
            alt={asset.name}
            className="pointer-events-none aspect-square w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-white/10">
            <ImageIcon className="h-5 w-5 text-slate-500" />
          </div>
        )}

        {onRemove ? (
          <button
            type="button"
            disabled={disabled || !removable}
            onClick={onRemove}
            aria-label={`Remove ${asset.name} from carousel`}
            className={cn(
              "absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500/60 text-white transition hover:bg-red-500/90 focus-visible:ring-2 focus-visible:ring-orange-400/60 focus-visible:outline-none",
              (!removable || disabled) && "cursor-not-allowed opacity-50",
            )}
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {onAction ? (
        <div className="mt-1.5 flex items-center justify-center">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={disabled}
            onClick={onAction}
            aria-label={`${actionLabel ?? "Add"} ${asset.name} to carousel`}
          >
            <Plus className="h-3 w-3" />
            {actionLabel ?? "Add"}
          </Button>
        </div>
      ) : null}

      {onMoveLeft || onMoveRight ? (
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            disabled={disabled || !onMoveLeft || index === 0}
            onClick={onMoveLeft}
            aria-label={`Move ${asset.name} left`}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400/60 focus-visible:outline-none",
              (disabled || !onMoveLeft || index === 0) &&
                "pointer-events-none opacity-30",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-slate-500">
            {typeof index === "number" && typeof total === "number"
              ? `${index + 1}/${total}`
              : null}
          </span>
          <button
            type="button"
            disabled={
              disabled ||
              !onMoveRight ||
              typeof index !== "number" ||
              typeof total !== "number" ||
              index === total - 1
            }
            onClick={onMoveRight}
            aria-label={`Move ${asset.name} right`}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400/60 focus-visible:outline-none",
              (disabled ||
                !onMoveRight ||
                typeof index !== "number" ||
                typeof total !== "number" ||
                index === total - 1) && "pointer-events-none opacity-30",
            )}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---- Sortable wrapper ---- */

function SortableComposerTile({
  asset,
  index,
  total,
  removable,
  disabled,
  onMoveLeft,
  onMoveRight,
  onRemove,
}: {
  asset: LocalAsset;
  index: number;
  total: number;
  removable: boolean;
  disabled: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: asset.id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
        cursor: disabled ? undefined : isDragging ? "grabbing" : "grab",
      }}
    >
      <ComposerTile
        asset={asset}
        removable={removable}
        disabled={disabled}
        isDragging={isDragging}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
        index={index}
        total={total}
        onRemove={onRemove}
      />
    </div>
  );
}
