"use client";

import { Archive, CalendarClock, ImageIcon, MoreHorizontal, Send, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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

type VisualState = "dirty" | "unposted" | "posted" | "scheduled" | "archived";

const STATE_LABEL: Record<VisualState, string> = {
  dirty: "Dirty",
  unposted: "Unposted",
  posted: "Posted",
  scheduled: "Scheduled",
  archived: "Archived",
};

const STATE_CHIP: Record<VisualState, string> = {
  dirty: "border-orange-300/45 bg-orange-400/10 text-orange-100",
  unposted: "border-slate-400/45 bg-slate-500/10 text-slate-200",
  posted: "border-emerald-300/45 bg-emerald-400/10 text-emerald-100",
  scheduled: "border-amber-300/45 bg-amber-400/10 text-amber-100",
  archived: "border-slate-500/40 bg-slate-700/20 text-slate-300",
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

function resolveState(status: string, isDirty: boolean): VisualState {
  if (isDirty) return "dirty";
  if (status === "published") return "posted";
  if (status === "scheduled") return "scheduled";
  if (status === "archived") return "archived";
  return "unposted";
}

type Props = {
  post: PostSummary;
  isActive: boolean;
  isDirty: boolean;
  onSelect: () => void;
  onPostNow?: () => void;
  onSchedulePost?: (scheduleAt: string) => void;
  onArchive: () => void;
  onDelete: () => void;
};

export function PostListItem({
  post,
  isActive,
  isDirty,
  onSelect,
  onPostNow,
  onSchedulePost,
  onArchive,
  onDelete,
}: Props) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const state = resolveState(post.status, isDirty);
  const canQuickPublish = Boolean(onPostNow && onSchedulePost);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        aria-label={`Select post: ${post.title || "Untitled Post"}`}
        className={cn(
          "group relative flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 pr-12 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60",
          isActive
            ? "border border-orange-400/30 bg-orange-400/10"
            : "hover:bg-white/5",
        )}
      >
        {/* Thumbnail */}
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/10">
          {post.thumbnail ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.thumbnail}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </TooltipTrigger>
              <TooltipContent
                side="right"
                align="start"
                className="overflow-hidden rounded-lg border border-white/20 bg-slate-950/95 p-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.thumbnail}
                  alt={post.title || "Post preview"}
                  className="h-40 w-40 rounded-md object-cover"
                />
              </TooltipContent>
            </Tooltip>
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
                  isDirty
                    ? "bg-orange-400"
                    : STATUS_DOT[post.status] ?? "bg-slate-400",
                )}
              />
            </TooltipTrigger>
            <TooltipContent side="right" className="capitalize">
              {STATE_LABEL[state]}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug font-medium text-white">
            {post.title || "Untitled Post"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                STATE_CHIP[state],
              )}
            >
              {STATE_LABEL[state]}
            </span>
            <span>{relativeTime(post.updatedAt)}</span>
            {post.assetCount > 0 && <span>{post.assetCount} assets</span>}
            {post.variantCount > 0 && <span>{post.variantCount} variants</span>}
          </div>
        </div>

        {/* Context menu */}
        <div className="absolute top-1.5 right-1.5 z-20 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 md:group-focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-slate-400 data-[state=open]:opacity-100"
                aria-label="Post options"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[182px]"
              onClick={(event) => event.stopPropagation()}
            >
              {canQuickPublish ? (
                <>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.stopPropagation();
                      onPostNow?.();
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Post now
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.stopPropagation();
                      setScheduleDialogOpen(true);
                    }}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Post at...
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                onSelect={(event) => {
                  event.stopPropagation();
                  onArchive();
                }}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

      <Dialog
        open={scheduleDialogOpen}
        onOpenChange={(open) => {
          setScheduleDialogOpen(open);
          if (!open) setScheduleAt("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post at</DialogTitle>
            <DialogDescription>
              Pick when this post should publish to Instagram.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="datetime-local"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!scheduleAt) return;
                onSchedulePost?.(scheduleAt);
                setScheduleDialogOpen(false);
              }}
              disabled={!scheduleAt}
              className="bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Schedule post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
