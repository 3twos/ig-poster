"use client";

import { Plus, Target, Trash2 } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MetaUserTag } from "@/lib/meta-schemas";

type Props = {
  ariaLabelPrefix: string;
  disabled?: boolean;
  imageUrl?: string;
  tags: MetaUserTag[];
  onChange: (next: MetaUserTag[]) => void;
};

type ImageFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clampCoordinate = (value: number) => Math.min(1, Math.max(0, value));
const EMPTY_IMAGE_FRAME: ImageFrame = { left: 0, top: 0, width: 0, height: 0 };

const calculateContainedImageFrame = (
  boxWidth: number,
  boxHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ImageFrame => {
  if (!boxWidth || !boxHeight || !naturalWidth || !naturalHeight) {
    return EMPTY_IMAGE_FRAME;
  }

  const boxAspect = boxWidth / boxHeight;
  const imageAspect = naturalWidth / naturalHeight;

  if (boxAspect > imageAspect) {
    const height = boxHeight;
    const width = height * imageAspect;
    return {
      left: (boxWidth - width) / 2,
      top: 0,
      width,
      height,
    };
  }

  const width = boxWidth;
  const height = width / imageAspect;
  return {
    left: 0,
    top: (boxHeight - height) / 2,
    width,
    height,
  };
};

export function MetaUserTagsEditor({
  ariaLabelPrefix,
  disabled = false,
  imageUrl,
  tags,
  onChange,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imageFrame, setImageFrame] = useState<ImageFrame>(EMPTY_IMAGE_FRAME);
  const imageRef = useRef<HTMLImageElement>(null);
  const selectedTagIndex =
    tags.length === 0 ? 0 : Math.min(selectedIndex, tags.length - 1);

  const measureImageFrame = useCallback(() => {
    const image = imageRef.current;
    if (!image) {
      setImageFrame(EMPTY_IMAGE_FRAME);
      return;
    }

    setImageFrame(
      calculateContainedImageFrame(
        image.clientWidth,
        image.clientHeight,
        image.naturalWidth,
        image.naturalHeight,
      ),
    );
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      measureImageFrame();
    });

    const image = imageRef.current;
    if (!image || typeof ResizeObserver === "undefined") {
      const handleResize = () => measureImageFrame();
      window.addEventListener("resize", handleResize);
      return () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener("resize", handleResize);
      };
    }

    const observer = new ResizeObserver(() => {
      measureImageFrame();
    });
    observer.observe(image);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [imageUrl, measureImageFrame]);

  const updateUsername = (index: number, username: string) => {
    onChange(
      tags.map((tag, currentIndex) =>
        currentIndex === index
          ? {
              ...tag,
              username,
            }
          : tag
      ),
    );
  };

  const updateTagPosition = (index: number, x: number, y: number) => {
    onChange(
      tags.map((tag, currentIndex) =>
        currentIndex === index
          ? {
              ...tag,
              x: clampCoordinate(x),
              y: clampCoordinate(y),
            }
          : tag,
      ),
    );
  };

  const updateCoordinate = (index: number, axis: "x" | "y", rawValue: string) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    onChange(
      tags.map((tag, currentIndex) =>
        currentIndex === index
          ? {
              ...tag,
              [axis]: clampCoordinate(parsed),
            }
          : tag
      ),
    );
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, currentIndex) => currentIndex !== index));
  };

  const addTag = () => {
    if (tags.length >= 20) return;
    setSelectedIndex(tags.length);
    onChange([
      ...tags,
      {
        username: "",
        x: 0.5,
        y: 0.5,
      },
    ]);
  };

  const handlePreviewClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || tags.length === 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    updateTagPosition(selectedTagIndex, x, y);
  };

  return (
    <div className="space-y-2">
      {imageUrl ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
            {/* Using a plain img here keeps arbitrary remote URLs and data URLs workable for click placement. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              className="block max-h-72 w-full object-contain"
              draggable={false}
              onLoad={measureImageFrame}
            />
            <div
              className="absolute"
              style={{
                left: imageFrame.left,
                top: imageFrame.top,
                width: imageFrame.width,
                height: imageFrame.height,
              }}
            >
              <button
                type="button"
                aria-label={`${ariaLabelPrefix} user tag image preview`}
                className="absolute inset-0 cursor-crosshair bg-transparent"
                onClick={handlePreviewClick}
                disabled={disabled || tags.length === 0}
              />
              {tags.map((tag, index) => {
                const label = tag.username.trim() || `Tag ${index + 1}`;
                return (
                  <button
                    key={`meta-user-tag-marker-${index}`}
                    type="button"
                    aria-label={`${ariaLabelPrefix} user tag marker ${index + 1}`}
                    className={[
                      "absolute z-10 flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border px-2 text-[10px] font-semibold shadow-lg transition",
                      selectedTagIndex === index
                        ? "border-emerald-200 bg-emerald-300 text-slate-950"
                        : "border-white/30 bg-slate-950/85 text-white",
                    ].join(" ")}
                    style={{
                      left: `${tag.x * 100}%`,
                      top: `${tag.y * 100}%`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedIndex(index);
                    }}
                    disabled={disabled}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            {tags.length > 0
              ? `Selected tag: ${tags[selectedTagIndex]?.username.trim() ? `@${tags[selectedTagIndex]?.username.trim().replace(/^@/, "")}` : `Tag ${selectedTagIndex + 1}`}. Click the image to place it.`
              : "Add a user tag to place it visually on the image."}
          </p>
        </div>
      ) : null}

      {tags.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          No user tags added yet.
        </p>
      ) : (
        tags.map((tag, index) => (
          <div
            key={`meta-user-tag-${index}`}
            className={[
              "rounded-md border bg-slate-950/35 p-2",
              selectedTagIndex === index
                ? "border-emerald-300/35"
                : "border-white/10",
            ].join(" ")}
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_92px_auto_auto]">
              <Input
                aria-label={`${ariaLabelPrefix} user tag username ${index + 1}`}
                value={tag.username}
                onChange={(event) => updateUsername(index, event.target.value)}
                className="text-xs"
                placeholder="@username"
                disabled={disabled}
              />
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                aria-label={`${ariaLabelPrefix} user tag x ${index + 1}`}
                value={String(tag.x)}
                onChange={(event) =>
                  updateCoordinate(index, "x", event.target.value)}
                className="text-xs"
                disabled={disabled}
              />
              <Input
                type="number"
                min={0}
                max={1}
                step={0.01}
                aria-label={`${ariaLabelPrefix} user tag y ${index + 1}`}
                value={String(tag.y)}
                onChange={(event) =>
                  updateCoordinate(index, "y", event.target.value)}
                className="text-xs"
                disabled={disabled}
              />
              <Button
                type="button"
                variant={selectedTagIndex === index ? "secondary" : "outline"}
                size="xs"
                aria-label={`${ariaLabelPrefix} select user tag ${index + 1} for image placement`}
                onClick={() => setSelectedIndex(index)}
                disabled={disabled}
              >
                <Target className="h-3 w-3" />
                Place
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={`${ariaLabelPrefix} remove user tag ${index + 1}`}
                onClick={() => removeTag(index)}
                disabled={disabled}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))
      )}
      <Button
        type="button"
        variant="outline"
        size="xs"
        aria-label={`${ariaLabelPrefix} add user tag`}
        onClick={addTag}
        disabled={disabled || tags.length >= 20}
      >
        <Plus className="h-3 w-3" />
        Add user tag
      </Button>
    </div>
  );
}
