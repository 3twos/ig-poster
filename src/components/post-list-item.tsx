"use client";

import { Archive, MoreHorizontal, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

import type { PostSummary } from "@/lib/post";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  draft: "bg-slate-400",
  generated: "bg-blue-400",
  published: "bg-green-400",
  scheduled: "bg-amber-400",
  archived: "bg-slate-600",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Props = {
  post: PostSummary;
  isActive: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

export function PostListItem({
  post,
  isActive,
  onSelect,
  onArchive,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = useCallback(() => {
    if (confirmDelete) {
      onDelete();
      setMenuOpen(false);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  }, [confirmDelete, onDelete]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 transition",
        isActive
          ? "border border-orange-400/30 bg-orange-400/10"
          : "hover:bg-white/5",
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          STATUS_DOT[post.status] ?? "bg-slate-400",
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {post.title || "Untitled Post"}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
          <span>{relativeTime(post.updatedAt)}</span>
          {post.assetCount > 0 && <span>{post.assetCount} assets</span>}
          {post.variantCount > 0 && <span>{post.variantCount} variants</span>}
        </div>
      </div>

      {/* Context menu trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((o) => !o);
          setConfirmDelete(false);
        }}
        className="shrink-0 rounded-md p-1 text-slate-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          className="absolute right-2 top-9 z-10 min-w-[140px] rounded-lg border border-white/15 bg-slate-800 py-1 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onArchive();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
          >
            <Archive className="h-3 w-3" />
            Archive
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-xs",
              confirmDelete
                ? "text-red-400 hover:bg-red-500/10"
                : "text-slate-300 hover:bg-white/10",
            )}
          >
            <Trash2 className="h-3 w-3" />
            {confirmDelete ? "Confirm delete?" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
