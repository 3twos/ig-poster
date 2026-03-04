"use client";

import { Cloud, CloudOff, Loader2, Plus, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { PostListItem } from "@/components/post-list-item";
import { usePostContext } from "@/contexts/post-context";
import type { PostStatus } from "@/lib/post";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ label: string; value: "all" | PostStatus }> = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Generated", value: "generated" },
  { label: "Published", value: "published" },
  { label: "Archived", value: "archived" },
];

function SidebarContent({ onPostSelect }: { onPostSelect?: () => void }) {
  const {
    posts,
    isLoadingPosts,
    activePost,
    selectPost,
    createNewPost,
    archivePost,
    deletePost,
    saveStatus,
  } = usePostContext();

  const [filter, setFilter] = useState<"all" | PostStatus>("all");
  const [isCreating, setIsCreating] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, filter]);

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
        <button
          type="button"
          onClick={() => void handleNewPost()}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Post
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 overflow-x-auto border-b border-white/10 px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
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
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            {filter === "all" ? "No posts yet" : `No ${filter} posts`}
          </p>
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
      <div className="border-t border-white/10 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {saveStatus === "saved" && (
            <>
              <Cloud className="h-3 w-3" />
              <span>Saved</span>
            </>
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
    <aside className="hidden w-[280px] shrink-0 lg:block">
      <div className="sticky top-6 flex max-h-[calc(100vh-120px)] flex-col rounded-2xl border border-white/15 bg-slate-900/55 backdrop-blur-xl">
        <SidebarContent />
      </div>
    </aside>
  );
}

/** Mobile slide-over drawer — visible below lg */
export function MobileSidebarDrawer() {
  const { isSidebarOpen, closeSidebar } = usePostContext();

  if (!isSidebarOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSidebar}
      />

      {/* Drawer panel */}
      <div className="absolute inset-y-0 left-0 flex w-[300px] flex-col border-r border-white/15 bg-slate-900/95 backdrop-blur-xl">
        {/* Close button */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-xs font-semibold tracking-[0.16em] text-orange-200 uppercase">
            Posts
          </span>
          <button
            type="button"
            onClick={closeSidebar}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <SidebarContent onPostSelect={closeSidebar} />
      </div>
    </div>
  );
}
