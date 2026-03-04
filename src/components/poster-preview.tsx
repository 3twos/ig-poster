"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef, memo, useEffect, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import {
  type AspectRatio,
  type CreativeVariant,
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

const ASPECT_MAP: Record<AspectRatio, string> = {
  "1:1": "1 / 1",
  "4:5": "4 / 5",
  "9:16": "9 / 16",
};

const renderOverlayBlock = (
  variant: CreativeVariant,
  brandName: string,
  options?: {
    hasLogo?: boolean;
  },
) => {
  const alignClass =
    variant.textAlign === "center"
      ? "items-center text-center"
      : "items-start text-left";

  if (variant.layout === "split-story") {
    return (
      <div className="absolute inset-0 grid grid-cols-[1.25fr_0.75fr]">
        <div className="flex h-full items-end p-6">
          <div className="w-full rounded-2xl bg-black/35 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold tracking-[0.2em] text-white/75 uppercase">
              {brandName}
            </p>
            <h2 className="mt-2 text-3xl leading-tight font-semibold text-white">
              {variant.headline}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/90">
              {variant.supportingText}
            </p>
            <p className="mt-4 text-sm font-medium text-white">{variant.cta}</p>
          </div>
        </div>
      </div>
    );
  }

  if (variant.layout === "minimal-logo") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-xs font-semibold tracking-[0.28em] text-white/70 uppercase">
          {variant.hook}
        </p>
        <h2 className="mt-3 max-w-[90%] text-4xl leading-tight font-semibold text-white md:text-5xl">
          {variant.headline}
        </h2>
        <p className="mt-4 max-w-md text-sm text-white/90">{variant.supportingText}</p>
        <p className="mt-6 rounded-full border border-white/35 px-4 py-2 text-xs font-semibold text-white uppercase">
          {variant.cta}
        </p>
      </div>
    );
  }

  if (variant.layout === "magazine") {
    return (
      <div className="absolute inset-0 flex flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-4">
          {!options?.hasLogo ? (
            <span className="rounded-full bg-black/35 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-white uppercase backdrop-blur-sm">
              {brandName}
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-black uppercase">
            {variant.name}
          </span>
        </div>
        <div className="rounded-2xl bg-black/45 p-5 backdrop-blur-md">
          <p className="text-xs font-medium text-white/70 uppercase">{variant.hook}</p>
          <h2 className="mt-2 text-3xl leading-tight font-semibold text-white">
            {variant.headline}
          </h2>
          <p className="mt-3 text-sm text-white/90">{variant.supportingText}</p>
          <p className="mt-4 text-sm font-semibold text-white">{variant.cta}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("absolute inset-0 flex justify-end", alignClass)}>
      <div className="mt-auto w-full p-6">
        <div className="rounded-2xl bg-black/45 p-5 backdrop-blur-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">
            {variant.hook}
          </p>
          <h2 className="mt-2 text-3xl leading-tight font-semibold text-white">
            {variant.headline}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/90">
            {variant.supportingText}
          </p>
          <p className="mt-4 text-sm font-semibold text-white">{variant.cta}</p>
        </div>
      </div>
    </div>
  );
};

const EditorOverlay = ({
  variant,
  layout,
  onChange,
  frame,
}: {
  variant: CreativeVariant;
  layout: OverlayLayout;
  onChange: (next: OverlayLayout) => void;
  frame: { width: number; height: number };
}) => {
  const blockMap = useMemo(
    () =>
      [
        {
          key: "hook" as const,
          label: "Hook",
          value: variant.hook,
          className:
            "text-xs font-semibold tracking-[0.22em] uppercase text-white/80",
        },
        {
          key: "headline" as const,
          label: "Headline",
          value: variant.headline,
          className: "text-3xl leading-tight font-semibold text-white",
        },
        {
          key: "supportingText" as const,
          label: "Body",
          value: variant.supportingText,
          className: "text-sm leading-relaxed text-white/90",
        },
        {
          key: "cta" as const,
          label: "CTA",
          value: variant.cta,
          className:
            "inline-flex rounded-full border border-white/40 px-3 py-1 text-xs font-semibold text-white uppercase",
        },
      ] as const,
    [variant.hook, variant.headline, variant.supportingText, variant.cta],
  );

  const commit = (
    key: keyof OverlayLayout,
    data: { x: number; y: number; width: number; height: number },
  ) => {
    const toPercent = {
      x: (data.x / frame.width) * 100,
      y: (data.y / frame.height) * 100,
      width: (data.width / frame.width) * 100,
      height: (data.height / frame.height) * 100,
    };

    onChange({
      ...layout,
      [key]: {
        ...layout[key],
        x: Math.max(0, Math.min(100, toPercent.x)),
        y: Math.max(0, Math.min(100, toPercent.y)),
        width: Math.max(5, Math.min(100, toPercent.width)),
        height: Math.max(5, Math.min(100, toPercent.height)),
      },
    });
  };

  return (
    <>
      {blockMap.map((block) => {
        const current = layout[block.key];
        const x = (current.x / 100) * frame.width;
        const y = (current.y / 100) * frame.height;
        const width = (current.width / 100) * frame.width;
        const height = (current.height / 100) * frame.height;

        return (
          <Rnd
            key={block.key}
            bounds="parent"
            size={{ width, height }}
            position={{ x, y }}
            minWidth={Math.max(frame.width * 0.16, 96)}
            minHeight={Math.max(frame.height * 0.06, 48)}
            dragHandleClassName={`drag-${block.key}`}
            onDragStop={(_event, data) => {
              commit(block.key, {
                x: data.x,
                y: data.y,
                width,
                height,
              });
            }}
            onResizeStop={(_event, _dir, ref, _delta, position) => {
              commit(block.key, {
                x: position.x,
                y: position.y,
                width: ref.offsetWidth,
                height: ref.offsetHeight,
              });
            }}
            className="overflow-hidden"
          >
            <div className="relative h-full w-full rounded-xl border border-orange-300/70 bg-black/35 p-2 backdrop-blur-sm">
              <span className="absolute top-1 right-1 rounded bg-orange-300/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950 uppercase">
                {block.label}
              </span>
              <div
                className={cn(`drag-${block.key} h-full w-full cursor-move p-1`, block.className)}
                style={{ fontSize: `${current.fontScale}em` }}
              >
                {block.key === "cta" ? <span>{block.value}</span> : block.value}
              </div>
            </div>
          </Rnd>
        );
      })}
    </>
  );
};

export const PosterPreview = memo(forwardRef<HTMLDivElement, PosterPreviewProps>(
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

    const canEdit =
      Boolean(editorMode) && Boolean(overlayLayout) && Boolean(onOverlayLayoutChange);

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

        {secondaryImage && variant.layout === "split-story" ? (
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

        {canEdit && overlayLayout && onOverlayLayoutChange && frameSize.width > 0 ? (
          <EditorOverlay
            variant={variant}
            layout={overlayLayout}
            onChange={onOverlayLayoutChange}
            frame={frameSize}
          />
        ) : (
          renderOverlayBlock(variant, brandName, { hasLogo: Boolean(logoImage) })
        )}

        {/* Carousel navigation arrows + dots */}
        {carouselSlides && onSlideChange
          ? (() => {
              const assetCount = variant.assetSequence.length;
              const navLength = Math.min(carouselSlides.length, assetCount);

              if (navLength < 2) return null;

              const clamped = Math.min(activeSlideIndex, navLength - 1);

              return (
                <>
                  <button
                    type="button"
                    aria-label="Previous slide"
                    onClick={() =>
                      onSlideChange(
                        clamped > 0 ? clamped - 1 : navLength - 1,
                      )
                    }
                    className="absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm transition hover:bg-black/70"
                  >
                    <ChevronLeft className="h-4 w-4 text-white" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next slide"
                    onClick={() =>
                      onSlideChange(
                        clamped < navLength - 1 ? clamped + 1 : 0,
                      )
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
                        aria-current={index === clamped ? "true" : undefined}
                        onClick={() => onSlideChange(index)}
                        className={cn(
                          "h-2 w-2 rounded-full transition",
                          index === clamped
                            ? "bg-white"
                            : "bg-white/40 hover:bg-white/70",
                        )}
                      />
                    ))}
                  </div>
                </>
              );
            })()
          : null}

        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold tracking-[0.2em] text-slate-900 uppercase">
          {logoImage ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoImage}
                alt="Brand logo"
                className="h-6 max-w-[4rem] object-contain"
              />
              {brandName}
            </>
          ) : (
            brandName
          )}
        </div>
      </div>
    );
  },
));

PosterPreview.displayName = "PosterPreview";
