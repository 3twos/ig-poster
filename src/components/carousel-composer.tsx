"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Image as ImageIcon,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const includedAssets = assetSequence
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is LocalAsset => Boolean(asset));
  const availableAssets = assets.filter((asset) => !assetSequence.includes(asset.id));
  const activeAsset = activeId ? assetMap.get(activeId) ?? null : null;
  const canAdd = includedAssets.length < 10;
  const canRemove = includedAssets.length > 2;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = assetSequence.indexOf(String(active.id));
    const newIndex = assetSequence.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onAssetSequenceChange(arrayMove(assetSequence, oldIndex, newIndex));
  };

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
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
            Included
          </p>
          <p className="text-[11px] text-slate-500">{includedAssets.length}/10 items</p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext
            items={includedAssets.map((asset) => asset.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {includedAssets.map((asset) => (
                <SortableComposerTile
                  key={asset.id}
                  asset={asset}
                  index={assetSequence.indexOf(asset.id)}
                  total={includedAssets.length}
                  removable={canRemove}
                  disabled={disabled}
                  onMoveLeft={() => {
                    const currentIndex = assetSequence.indexOf(asset.id);
                    if (currentIndex <= 0) return;
                    onAssetSequenceChange(
                      arrayMove(assetSequence, currentIndex, currentIndex - 1),
                    );
                  }}
                  onMoveRight={() => {
                    const currentIndex = assetSequence.indexOf(asset.id);
                    if (currentIndex === -1 || currentIndex >= assetSequence.length - 1) {
                      return;
                    }
                    onAssetSequenceChange(
                      arrayMove(assetSequence, currentIndex, currentIndex + 1),
                    );
                  }}
                  onRemove={() => {
                    if (!canRemove) return;
                    onAssetSequenceChange(
                      assetSequence.filter((assetId) => assetId !== asset.id),
                    );
                  }}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeAsset ? <ComposerTile asset={activeAsset} dragOverlay /> : null}
          </DragOverlay>
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {availableAssets.map((asset) => (
              <ComposerTile
                key={asset.id}
                asset={asset}
                disabled={disabled || !canAdd}
                actionLabel="Add"
                onAction={() => {
                  if (!canAdd) return;
                  onAssetSequenceChange([...assetSequence, asset.id]);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ComposerTile({
  asset,
  removable = false,
  disabled = false,
  dragOverlay = false,
  dragHandleProps,
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
  dragOverlay?: boolean;
  dragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  };
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
        "group rounded-xl border border-white/10 bg-black/20 p-2",
        dragOverlay && "border-orange-300/50 shadow-lg shadow-orange-500/10",
      )}
    >
      <div className="relative overflow-hidden rounded-lg">
        {asset.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.posterUrl || asset.previewUrl}
            alt={asset.name}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-white/10">
            <ImageIcon className="h-5 w-5 text-slate-500" />
          </div>
        )}

        {dragHandleProps ? (
          <div
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            className={cn(
              "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-1 text-[10px] text-white",
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <GripVertical className="h-3 w-3" />
            Drag
          </div>
        ) : null}

        {onRemove ? (
          <button
            type="button"
            disabled={disabled || !removable}
            onClick={onRemove}
            aria-label={`Remove ${asset.name} from carousel`}
            className={cn(
              "absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-white transition hover:bg-red-400",
              (!removable || disabled) && "cursor-not-allowed opacity-50",
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-200">
          {asset.name}
        </p>
        {onAction ? (
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
        ) : null}
      </div>
      {onMoveLeft || onMoveRight ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={disabled || !onMoveLeft || index === 0}
            onClick={onMoveLeft}
            aria-label={`Move ${asset.name} left`}
          >
            <ArrowLeft className="h-3 w-3" />
            Left
          </Button>
          <span className="text-[10px] text-slate-500">
            {typeof index === "number" && typeof total === "number"
              ? `${index + 1}/${total}`
              : null}
          </span>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={
              disabled ||
              !onMoveRight ||
              typeof index !== "number" ||
              typeof total !== "number" ||
              index === total - 1
            }
            onClick={onMoveRight}
            aria-label={`Move ${asset.name} right`}
          >
            Right
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

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
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <ComposerTile
        asset={asset}
        removable={removable}
        disabled={disabled}
        dragHandleProps={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as unknown as Record<string, unknown>,
        }}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
        index={index}
        total={total}
        onRemove={onRemove}
      />
    </div>
  );
}
