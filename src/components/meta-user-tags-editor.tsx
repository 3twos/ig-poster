"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MetaUserTag } from "@/lib/meta-schemas";

type Props = {
  ariaLabelPrefix: string;
  disabled?: boolean;
  tags: MetaUserTag[];
  onChange: (next: MetaUserTag[]) => void;
};

const clampCoordinate = (value: number) => Math.min(1, Math.max(0, value));

export function MetaUserTagsEditor({
  ariaLabelPrefix,
  disabled = false,
  tags,
  onChange,
}: Props) {
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
    onChange([
      ...tags,
      {
        username: "",
        x: 0.5,
        y: 0.5,
      },
    ]);
  };

  return (
    <div className="space-y-2">
      {tags.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          No user tags added yet.
        </p>
      ) : (
        tags.map((tag, index) => (
          <div
            key={`meta-user-tag-${index}`}
            className="rounded-md border border-white/10 bg-slate-950/35 p-2"
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_92px_auto]">
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
