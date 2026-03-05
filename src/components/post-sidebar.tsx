"use client";

import { Cloud, CloudOff, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PostListItem } from "@/components/post-list-item";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePostContext } from "@/contexts/post-context";
import type { PostStatus } from "@/lib/post";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ label: string; value: "all" | PostStatus }> = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Archived", value: "archived" },
];

export function SidebarContent({ onPostSelect }: { onPostSelect?: () => void }) {
  const {
    posts,
    archivedPosts,
    isLoadingPosts,
    activePost,
    selectPost,
    createNewPost,
    archivePost,
    deletePost,
    refreshArchivedPosts,
    saveStatus,
  } = usePostContext();

  const [filter, setFilter] = useState<"all" | PostStatus>("all");
  const [isCreating, setIsCreating] = useState(false);

  // Lazy-load archived posts when switching to Archived tab
  const didLoadArchivedRef = useRef(false);
  useEffect(() => {
    if (filter === "archived" && !didLoadArchivedRef.current) {
      didLoadArchivedRef.current = true;
      void refreshArchivedPosts();
    }
  }, [filter, refreshArchivedPosts]);

  const filtered = useMemo(() => {
    if (filter === "archived") return archivedPosts;
    if (filter === "all") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, archivedPosts, filter]);

  const handleNewPost = async () => {
    setIsCreating(true);
    try {
      await createNewPost();
      onPostSelect?.();
    } finally {
      setIsCreating(false);
    }
  };

  const handleSelect = useCallback(
    (id: string) => {
      void selectPost(id).then(() => onPostSelect?.());
    },
    [selectPost, onPostSelect],
  );

  return (
    <>
      {/* New Post button */}
      <div className="border-b border-white/10 p-3">
        <Button
          onClick={() => void handleNewPost()}
          disabled={isCreating}
          className="w-full"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Post
        </Button>
      </div>

      {/* Filter tabs */}
      <div role="group" aria-label="Filter posts" className="flex gap-0.5 overflow-x-auto border-b border-white/10 px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition",
              filter === f.value
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-slate-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Post list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoadingPosts ? (
          <div className="space-y-2 px-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl px-3 py-2.5">
                <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-slate-500">
              {filter === "all" ? "No posts yet" : `No ${filter} posts`}
            </p>
            {filter === "all" && (
              <p className="mt-1 text-[11px] text-slate-600">
                Create your first post to get started
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((post) => (
              <PostListItem
                key={post.id}
                post={post}
                isActive={post.id === activePost?.id}
                onSelect={() => handleSelect(post.id)}
                onArchive={() => void archivePost(post.id)}
                onDelete={() => void deletePost(post.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Save status */}
      <div className="border-t border-white/10 px-3 py-2" aria-live="polite">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {saveStatus === "saved" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5">
                  <Cloud className="h-3 w-3" />
                  <span>Saved</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>All changes saved</TooltipContent>
            </Tooltip>
          )}
          {saveStatus === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === "unsaved" && (
            <>
              <CloudOff className="h-3 w-3 text-orange-400" />
              <span className="text-orange-400">Unsaved changes</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <CloudOff className="h-3 w-3 text-red-400" />
              <span className="text-red-400">Save failed</span>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Desktop sidebar — hidden below lg */
export function PostSidebar() {
  return (
    <aside aria-label="Post list" className="hidden w-[280px] shrink-0 lg:block">
      <div className="sticky top-6 flex max-h-[calc(100vh-120px)] flex-col rounded-2xl border border-white/15 bg-slate-900/55 backdrop-blur-xl">
        <SidebarContent />
      </div>
    </aside>
  );
}

/** Mobile slide-over drawer using shadcn Sheet */
export function MobileSidebarDrawer() {
  const { isSidebarOpen, closeSidebar } = usePostContext();

  return (
    <Sheet open={isSidebarOpen} onOpenChange={(open) => !open && closeSidebar()}>
      <SheetContent
        side="left"
        className="w-[300px] border-r border-white/15 bg-slate-900/95 p-0 backdrop-blur-xl"
      >
        <SheetHeader className="border-b border-white/10 px-4 py-3">
          <SheetTitle className="text-xs font-semibold tracking-[0.16em] text-orange-200 uppercase">
            Posts
          </SheetTitle>
        </SheetHeader>
        <div className="flex h-[calc(100%-3.5rem)] flex-col">
          <SidebarContent onPostSelect={closeSidebar} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
