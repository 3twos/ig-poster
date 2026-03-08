"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Rnd } from "react-rnd";

import {
  DEFAULT_LOGO_POSITION,
  normalizeOverlayLayout,
  type AspectRatio,
  type CanonicalOverlayKey,
  type CreativeVariant,
  type LogoPosition,
  type OverlayLayout,
} from "@/lib/creative";
import { cn, hexToRgba } from "@/lib/utils";

type CarouselSlide = {
  index: number;
  goal: string;
  headline: string;
  body: string;
  assetHint: string;
};

type PosterPreviewProps = {
  variant: CreativeVariant;
  brandName: string;
  aspectRatio: AspectRatio;
  primaryImage?: string;
  secondaryImage?: string;
  logoImage?: string;
  overlayLayout?: OverlayLayout;
  editorMode?: boolean;
  onOverlayLayoutChange?: (layout: OverlayLayout) => void;
  carouselSlides?: CarouselSlide[];
  activeSlideIndex?: number;
  onSlideChange?: (index: number) => void;
};

type OverlayCanvasBlock = {
  id: string;
  label: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontScale: number;
  visible: boolean;
  type: "canonical" | "custom";
  key?: CanonicalOverlayKey;
  className: string;
  containerClassName: string;
  contentClassName: string;
  borderRadius: number;
};

const ASPECT_MAP: Record<AspectRatio, string> = {
  "1:1": "1 / 1",
  "4:5": "4 / 5",
  "1.91:1": "1.91 / 1",
  "9:16": "9 / 16",
};

const resolveCarouselCopy = (
  variant: CreativeVariant,
  carouselSlides: CarouselSlide[] | undefined,
  activeSlideIndex: number,
) => {
  const slide = carouselSlides?.[activeSlideIndex];
  const lastSlideIndex = Math.max((carouselSlides?.length ?? 1) - 1, 0);

  if (!slide || variant.postType !== "carousel" || activeSlideIndex === 0) {
    return {
      hook: variant.hook,
      headline: variant.headline,
      supportingText: variant.supportingText,
      cta: variant.cta,
    };
  }

  return {
    hook: slide.goal,
    headline: slide.headline,
    supportingText: slide.body,
    cta: activeSlideIndex === lastSlideIndex ? variant.cta : "Swipe for more",
  };
};

const buildOverlayBlocks = (
  variant: CreativeVariant,
  overlayLayout: OverlayLayout,
  carouselSlides: CarouselSlide[] | undefined,
  activeSlideIndex: number,
): OverlayCanvasBlock[] => {
  const resolvedCopy = resolveCarouselCopy(variant, carouselSlides, activeSlideIndex);
  const alignClass =
    variant.textAlign === "center" ? "items-center text-center" : "items-start text-left";

  const canonicalBlocks: OverlayCanvasBlock[] = [
    {
      id: "hook",
      label: "Hook",
      key: "hook",
      type: "canonical",
      ...overlayLayout.hook,
      text: overlayLayout.hook.text.trim() || resolvedCopy.hook,
      borderRadius: overlayLayout.hook.borderRadius ?? 16,
      className: "text-xs font-semibold tracking-[0.22em] uppercase text-white/80",
      containerClassName: "bg-black/28 backdrop-blur-sm",
      contentClassName: alignClass,
    },
    {
      id: "headline",
      label: "Headline",
      key: "headline",
      type: "canonical",
      ...overlayLayout.headline,
      text: overlayLayout.headline.text.trim() || resolvedCopy.headline,
      borderRadius: overlayLayout.headline.borderRadius ?? 26,
      className: "text-3xl leading-tight font-semibold text-white",
      containerClassName: "bg-black/42 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.9)] backdrop-blur-md",
      contentClassName: alignClass,
    },
    {
      id: "supportingText",
      label: "Body",
      key: "supportingText",
      type: "canonical",
      ...overlayLayout.supportingText,
      text: overlayLayout.supportingText.text.trim() || resolvedCopy.supportingText,
      borderRadius: overlayLayout.supportingText.borderRadius ?? 24,
      className: "text-sm leading-relaxed text-white/90",
      containerClassName: "bg-black/36 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.9)] backdrop-blur-md",
      contentClassName: alignClass,
    },
    {
      id: "cta",
      label: "CTA",
      key: "cta",
      type: "canonical",
      ...overlayLayout.cta,
      text: overlayLayout.cta.text.trim() || resolvedCopy.cta,
      borderRadius: overlayLayout.cta.borderRadius ?? 9999,
      className:
        "inline-flex rounded-full border border-white/35 bg-black/20 px-3 py-1 text-xs font-semibold uppercase text-white",
      containerClassName: "bg-transparent",
      contentClassName: cn("justify-start", variant.textAlign === "center" && "justify-center"),
    },
  ];

  const customBlocks = (overlayLayout.custom ?? []).map((block, index) => ({
    id: block.id,
    label: block.label || `Text Box ${index + 1}`,
    type: "custom" as const,
    text: block.text.trim(),
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
    fontScale: block.fontScale,
    visible: block.visible,
    borderRadius: block.borderRadius ?? 24,
    className: "text-sm leading-relaxed text-white",
    containerClassName: "bg-black/34 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.88)] backdrop-blur-md",
    contentClassName: alignClass,
  }));

  return [...canonicalBlocks, ...customBlocks].filter(
    (block) => block.visible && block.text.trim().length > 0,
  );
};

/* ── Phase 2: OverlayBlockBody uses min-h instead of fixed h ── */

const OverlayBlockBody = ({
  block,
  isEditing,
  onTextCommit,
  onEditStart,
}: {
  block: OverlayCanvasBlock;
  isEditing?: boolean;
  onTextCommit?: (text: string, contentHeight?: number) => void;
  onEditStart?: () => void;
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  const handleBlur = useCallback(() => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      // Restore original text on cancel
      if (spanRef.current) {
        spanRef.current.textContent = block.text;
      }
      return;
    }
    if (!onTextCommit || !spanRef.current) return;
    const contentHeight = bodyRef.current?.scrollHeight;
    onTextCommit(spanRef.current.textContent ?? "", contentHeight);
  }, [block.text, onTextCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelledRef.current = true;
        (e.target as HTMLElement).blur();
      }
    },
    [],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!spanRef.current || !spanRef.current.contains(range.commonAncestorContainer)) return;

      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    },
    [],
  );

  return (
    <div
      ref={bodyRef}
      className={cn(
        "flex min-h-full w-full p-3",
        block.containerClassName,
        block.key === "cta" ? "items-start" : "items-stretch",
      )}
      style={{ borderRadius: block.borderRadius }}
      onDoubleClick={onEditStart}
    >
      <div
        className={cn(
          "flex min-h-full w-full whitespace-pre-wrap break-words",
          block.contentClassName,
        )}
        style={{ fontSize: `${block.fontScale}em` }}
      >
        <span
          ref={spanRef}
          className={cn(block.className, isEditing && "outline-none ring-1 ring-orange-300/60 rounded px-0.5")}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={isEditing ? handleBlur : undefined}
          onKeyDown={isEditing ? handleKeyDown : undefined}
          onPaste={isEditing ? handlePaste : undefined}
        >
          {block.text}
        </span>
      </div>
    </div>
  );
};

/* ── Phase 2: OverlayBlock uses minHeight instead of fixed height ── */

const OverlayBlock = ({
  block,
  editable,
}: {
  block: OverlayCanvasBlock;
  editable: boolean;
}) => (
  <div
    className="pointer-events-none absolute z-20"
    style={{
      left: `${block.x}%`,
      top: `${block.y}%`,
      width: `${block.width}%`,
      minHeight: `${block.height}%`,
    }}
  >
    <div
      className={cn("min-h-full w-full", editable && "border border-white/10")}
      style={{ borderRadius: block.borderRadius }}
    >
      <OverlayBlockBody block={block} />
    </div>
  </div>
);

/** Convert pixel rect to percent-of-frame, clamping to given minimums. */
const toPercentRect = (
  data: { x: number; y: number; width: number; height: number },
  frame: { width: number; height: number },
  minWidth = 5,
  minHeight = 5,
) => ({
  x: Math.max(0, Math.min(100, (data.x / frame.width) * 100)),
  y: Math.max(0, Math.min(100, (data.y / frame.height) * 100)),
  width: Math.max(minWidth, Math.min(100, (data.width / frame.width) * 100)),
  height: Math.max(minHeight, Math.min(100, (data.height / frame.height) * 100)),
});

/* ── Phase 4: LogoBadge component ── */

const LogoBadge = ({
  logoImage,
  brandName,
  logoTone,
  logoPos,
  editorMode,
  frame,
  onPositionChange,
}: {
  logoImage?: string;
  brandName: string;
  logoTone: "light" | "dark";
  logoPos: LogoPosition;
  editorMode: boolean;
  frame: { width: number; height: number };
  onPositionChange?: (pos: LogoPosition) => void;
}) => {
  const badgeContent = (
    <div
      className={cn(
        "flex h-full w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase shadow-lg backdrop-blur-sm",
        logoImage
          ? logoTone === "light"
            ? "border-white/15 bg-slate-950/78 text-white"
            : "border-black/10 bg-white/92 text-slate-950"
          : "border-black/10 bg-white/90 text-slate-900",
      )}
    >
      {logoImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoImage}
          alt={`${brandName} logo`}
          className="h-6 max-w-[4rem] object-contain"
        />
      ) : (
        brandName
      )}
    </div>
  );

  if (!editorMode || !onPositionChange || frame.width === 0) {
    return (
      <div
        className="absolute z-20"
        style={{
          left: `${logoPos.x}%`,
          top: `${logoPos.y}%`,
          width: `${logoPos.width}%`,
          height: `${logoPos.height}%`,
        }}
      >
        {badgeContent}
      </div>
    );
  }

  const x = (logoPos.x / 100) * frame.width;
  const y = (logoPos.y / 100) * frame.height;
  const width = (logoPos.width / 100) * frame.width;
  const height = (logoPos.height / 100) * frame.height;

  return (
    <Rnd
      bounds="parent"
      size={{ width, height }}
      position={{ x, y }}
      minWidth={Math.max(frame.width * 0.08, 48)}
      minHeight={Math.max(frame.height * 0.03, 24)}
      onDragStop={(_event, data) => {
        const next = toPercentRect({ x: data.x, y: data.y, width, height }, frame, 3, 2);
        onPositionChange({ ...logoPos, ...next });
      }}
      onResizeStop={(_event, _dir, ref, _delta, position) => {
        const next = toPercentRect({
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        }, frame, 3, 2);
        onPositionChange({ ...logoPos, ...next });
      }}
      className="z-20"
    >
      <div className="relative h-full w-full rounded-xl border border-orange-300/70 p-0.5">
        <span className="absolute -top-4 left-1 rounded bg-orange-300/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950 uppercase">
          Logo
        </span>
        {badgeContent}
      </div>
    </Rnd>
  );
};

/* ── Phase 2+3: EditorOverlay with auto-resize and inline editing ── */

const EditorOverlay = ({
  blocks,
  layout,
  onChange,
  frame,
}: {
  blocks: OverlayCanvasBlock[];
  layout: OverlayLayout;
  onChange: (next: OverlayLayout) => void;
  frame: { width: number; height: number };
}) => {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const updateBlockRect = (
    block: OverlayCanvasBlock,
    data: { x: number; y: number; width: number; height: number },
  ) => {
    const nextRect = toPercentRect(data, frame);

    if (block.type === "canonical" && block.key) {
      onChange({
        ...layout,
        [block.key]: {
          ...layout[block.key],
          ...nextRect,
        },
      });
      return;
    }

    onChange({
      ...layout,
      custom: (layout.custom ?? []).map((item) =>
        item.id === block.id ? { ...item, ...nextRect } : item,
      ),
    });
  };

  const updateBlockText = useCallback(
    (block: OverlayCanvasBlock, text: string, contentHeight?: number) => {
      // Auto-size: convert measured content height to percentage
      let newHeight: number | undefined;
      if (contentHeight && frame.height > 0) {
        // Add ~40px for the editor chrome (p-2 padding + top controls)
        newHeight = Math.max(5, ((contentHeight + 40) / frame.height) * 100);
      }

      if (block.type === "canonical" && block.key) {
        onChange({
          ...layout,
          [block.key]: {
            ...layout[block.key],
            text,
            ...(newHeight != null && { height: newHeight }),
          },
        });
      } else {
        onChange({
          ...layout,
          custom: (layout.custom ?? []).map((item) =>
            item.id === block.id
              ? { ...item, text, ...(newHeight != null && { height: newHeight }) }
              : item,
          ),
        });
      }
      setEditingBlockId(null);
    },
    [layout, onChange, frame.height],
  );

  const updateBlockRadius = useCallback(
    (block: OverlayCanvasBlock, borderRadius: number) => {
      if (block.type === "canonical" && block.key) {
        onChange({
          ...layout,
          [block.key]: { ...layout[block.key], borderRadius },
        });
      } else {
        onChange({
          ...layout,
          custom: (layout.custom ?? []).map((item) =>
            item.id === block.id ? { ...item, borderRadius } : item,
          ),
        });
      }
    },
    [layout, onChange],
  );

  const removeBlock = (block: OverlayCanvasBlock) => {
    if (block.type === "canonical" && block.key) {
      onChange({
        ...layout,
        [block.key]: {
          ...layout[block.key],
          visible: false,
        },
      });
      return;
    }

    onChange({
      ...layout,
      custom: (layout.custom ?? []).filter((item) => item.id !== block.id),
    });
  };

  return (
    <>
      {blocks.map((block) => {
        const x = (block.x / 100) * frame.width;
        const y = (block.y / 100) * frame.height;
        const width = (block.width / 100) * frame.width;
        const minHeight = (block.height / 100) * frame.height;
        const isEditing = editingBlockId === block.id;

        return (
          <Rnd
            key={block.id}
            bounds="parent"
            size={{ width, height: minHeight }}
            position={{ x, y }}
            minWidth={Math.max(frame.width * 0.16, 96)}
            minHeight={Math.max(frame.height * 0.06, 48)}
            dragHandleClassName={`drag-${block.id}`}
            disableDragging={isEditing}
            enableResizing={!isEditing}
            onDragStop={(_event, data) => {
              updateBlockRect(block, {
                x: data.x,
                y: data.y,
                width,
                height: minHeight,
              });
            }}
            onResizeStop={(_event, _dir, ref, _delta, position) => {
              updateBlockRect(block, {
                x: position.x,
                y: position.y,
                width: ref.offsetWidth,
                height: ref.offsetHeight,
              });
            }}
          >
            <div
              className="relative h-full w-full border border-orange-300/70 bg-black/24 p-2 backdrop-blur-sm"
              style={{ borderRadius: Math.min(block.borderRadius, 28) }}
            >
              <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={Math.min(block.borderRadius, 48)}
                  onChange={(e) => updateBlockRadius(block, parseInt(e.target.value))}
                  className="h-3 w-12 accent-orange-300"
                  title={`Corner radius: ${block.borderRadius}px`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <span className="rounded bg-orange-300/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950 uppercase">
                  {block.label}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${block.label}`}
                  className="rounded bg-slate-950/80 p-1 text-white transition hover:bg-slate-950"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeBlock(block);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className={cn(`drag-${block.id} h-full w-full`, !isEditing && "cursor-move")}>
                <OverlayBlockBody
                  block={block}
                  isEditing={isEditing}
                  onEditStart={() => setEditingBlockId(block.id)}
                  onTextCommit={(text, contentHeight) => updateBlockText(block, text, contentHeight)}
                />
              </div>
            </div>
          </Rnd>
        );
      })}
    </>
  );
};

const sampleLogoTone = async (url: string): Promise<"light" | "dark"> => {
  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("logo-load-failed"));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "light";
  }

  const sampleWidth = 48;
  const sampleHeight = Math.max(1, Math.round((image.height / image.width) * sampleWidth));
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let luminanceTotal = 0;
  let opaquePixels = 0;

  for (let index = 0; index < pixels.length; index += 16) {
    const alpha = pixels[index + 3];
    if (alpha < 32) {
      continue;
    }

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    luminanceTotal += r * 0.2126 + g * 0.7152 + b * 0.0722;
    opaquePixels += 1;
  }

  if (opaquePixels === 0) {
    return "light";
  }

  return luminanceTotal / opaquePixels > 160 ? "light" : "dark";
};

export const PosterPreview = memo(
  forwardRef<HTMLDivElement, PosterPreviewProps>(
    (
      {
        variant,
        brandName,
        aspectRatio,
        primaryImage,
        secondaryImage,
        logoImage,
        overlayLayout,
        editorMode,
        onOverlayLayoutChange,
        carouselSlides,
        activeSlideIndex = 0,
        onSlideChange,
      },
      ref,
    ) => {
      const [colorA, colorB] = variant.colorHexes;
      const overlay = `linear-gradient(135deg, ${hexToRgba(colorA, variant.overlayStrength)} 0%, ${hexToRgba(
        colorB || "#0F172A",
        Math.max(variant.overlayStrength - 0.12, 0.16),
      )} 100%)`;

      const frameRef = useRef<HTMLDivElement>(null);
      const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
      const [logoTone, setLogoTone] = useState<"light" | "dark">("light");

      useEffect(() => {
        const node = frameRef.current;
        if (!node) {
          return;
        }

        const update = () => {
          setFrameSize({ width: node.clientWidth, height: node.clientHeight });
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);

        return () => observer.disconnect();
      }, []);

      useEffect(() => {
        if (!logoImage) {
          return;
        }

        let cancelled = false;
        void sampleLogoTone(logoImage)
          .then((tone) => {
            if (!cancelled) {
              setLogoTone(tone);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setLogoTone("light");
            }
          });

        return () => {
          cancelled = true;
        };
      }, [logoImage]);

      const resolvedOverlayLayout = useMemo(
        () => normalizeOverlayLayout(variant.layout, overlayLayout),
        [overlayLayout, variant.layout],
      );

      const logoPos = resolvedOverlayLayout.logo ?? DEFAULT_LOGO_POSITION;

      const navLength =
        variant.postType === "carousel"
          ? Math.min(
              carouselSlides?.length ?? variant.assetSequence.length,
              variant.assetSequence.length,
            )
          : 0;
      const clampedSlideIndex =
        navLength > 0 ? Math.min(activeSlideIndex, navLength - 1) : 0;

      const visibleBlocks = useMemo(
        () =>
          buildOverlayBlocks(
            variant,
            resolvedOverlayLayout,
            carouselSlides,
            clampedSlideIndex,
          ),
        [carouselSlides, clampedSlideIndex, resolvedOverlayLayout, variant],
      );

      const canEdit =
        Boolean(editorMode) &&
        Boolean(onOverlayLayoutChange) &&
        frameSize.width > 0 &&
        frameSize.height > 0;

      const handleLogoPositionChange = useCallback(
        (pos: LogoPosition) => {
          if (!onOverlayLayoutChange) return;
          onOverlayLayoutChange({
            ...resolvedOverlayLayout,
            logo: pos,
          });
        },
        [onOverlayLayoutChange, resolvedOverlayLayout],
      );

      return (
        <div
          ref={ref}
          className="relative w-full overflow-hidden rounded-3xl border border-white/20 bg-slate-900 shadow-[0_30px_120px_-45px_rgba(15,23,42,0.85)]"
          style={{ aspectRatio: ASPECT_MAP[aspectRatio] }}
        >
          <div ref={frameRef} className="absolute inset-0">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryImage}
                alt="Primary poster asset"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,#334155_0%,#0f172a_45%,#020617_100%)]" />
            )}
          </div>

          {secondaryImage &&
          variant.layout === "split-story" &&
          variant.postType !== "carousel" ? (
            <div className="absolute top-0 right-0 h-full w-[34%] overflow-hidden border-l border-white/25">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={secondaryImage}
                alt="Secondary poster asset"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="absolute inset-0" style={{ background: overlay }} />

          {!canEdit
            ? visibleBlocks.map((block) => (
                <OverlayBlock key={block.id} block={block} editable={false} />
              ))
            : null}

          {canEdit && onOverlayLayoutChange ? (
            <EditorOverlay
              key={`editor-${variant.id}-${frameSize.width}-${frameSize.height}`}
              blocks={visibleBlocks}
              layout={resolvedOverlayLayout}
              onChange={onOverlayLayoutChange}
              frame={frameSize}
            />
          ) : null}

          {navLength > 1 && onSlideChange ? (
            <>
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() =>
                  onSlideChange(clampedSlideIndex > 0 ? clampedSlideIndex - 1 : navLength - 1)
                }
                className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm transition hover:bg-black/70"
              >
                <ChevronLeft className="h-4 w-4 text-white" />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() =>
                  onSlideChange(clampedSlideIndex < navLength - 1 ? clampedSlideIndex + 1 : 0)
                }
                className="absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm transition hover:bg-black/70"
              >
                <ChevronRight className="h-4 w-4 text-white" />
              </button>
              <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
                {Array.from({ length: navLength }).map((_, index) => (
                  <button
                    key={`dot-${index}`}
                    type="button"
                    aria-label={`Go to slide ${index + 1}`}
                    aria-current={index === clampedSlideIndex ? "true" : undefined}
                    onClick={() => onSlideChange(index)}
                    className={cn(
                      "h-2 w-2 rounded-full transition",
                      index === clampedSlideIndex
                        ? "bg-white"
                        : "bg-white/40 hover:bg-white/70",
                    )}
                  />
                ))}
              </div>
            </>
          ) : null}

          {logoPos.visible !== false ? (
            <LogoBadge
              logoImage={logoImage}
              brandName={brandName}
              logoTone={logoTone}
              logoPos={logoPos}
              editorMode={canEdit}
              frame={frameSize}
              onPositionChange={canEdit ? handleLogoPositionChange : undefined}
            />
          ) : null}
        </div>
      );
    },
  ),
);

PosterPreview.displayName = "PosterPreview";
