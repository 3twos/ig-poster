"use client";

import { Archive, ImageIcon, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group relative flex items-start gap-2 rounded-xl px-3 py-2.5 transition",
          isActive
            ? "border border-orange-400/30 bg-orange-400/10"
            : "hover:bg-white/5",
        )}
      >
        {/* Clickable selection overlay */}
        <button
          type="button"
          onClick={onSelect}
          className="absolute inset-0 z-0 cursor-pointer rounded-xl"
          aria-label={`Select post: ${post.title || "Untitled Post"}`}
        />

        {/* Thumbnail */}
        <div className="relative z-10 h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
          {post.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-4 w-4 text-slate-500" />
            </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full ring-1 ring-slate-900",
                  STATUS_DOT[post.status] ?? "bg-slate-400",
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="capitalize">
              {post.status}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Content */}
        <div className="relative z-10 min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-white">
            {post.title || "Untitled Post"}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
            <span>{relativeTime(post.updatedAt)}</span>
            {post.assetCount > 0 && <span>{post.assetCount} assets</span>}
            {post.variantCount > 0 && <span>{post.variantCount} variants</span>}
          </div>
        </div>

        {/* Archive icon button (visible on hover) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative z-10 shrink-0 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-orange-300"
              aria-label="Archive post"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive</TooltipContent>
        </Tooltip>

        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="relative z-10 shrink-0 text-slate-500 opacity-0 transition group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="Post options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px]">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{post.title || "Untitled Post"}&rdquo;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete();
                setDeleteDialogOpen(false);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
