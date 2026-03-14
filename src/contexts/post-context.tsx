"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { PostSummary } from "@/lib/post";
import { serializePostDraft } from "@/lib/post-draft";
import { DuplicatePostResponseSchema } from "@/lib/post-api";
import {
  postReducer,
  type PostAction,
  type PostDraft,
  type PostRowWithDestinations,
} from "@/hooks/use-post-reducer";
import { useAutoSave, type SaveStatus } from "@/hooks/use-auto-save";

type PostContextValue = {
  // Sidebar
  posts: PostSummary[];
  archivedPosts: PostSummary[];
  isLoadingPosts: boolean;
  refreshPosts: () => Promise<void>;
  refreshArchivedPosts: () => Promise<void>;

  // Active post
  activePost: PostDraft | null;
  dispatch: React.Dispatch<PostAction>;

  // Navigation
  selectPost: (id: string) => Promise<void>;
  createNewPost: () => Promise<string>;
  duplicatePost: (id: string) => Promise<string>;
  archivePost: (id: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;

  // Save
  saveStatus: SaveStatus;
  saveNow: () => Promise<boolean>;

  // Mobile
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
};

const PostContext = createContext<PostContextValue | null>(null);

const destinationsEqual = (
  left: PostSummary["destinations"],
  right: PostSummary["destinations"],
) => JSON.stringify(left ?? []) === JSON.stringify(right ?? []);

function summariesEqual(a: PostSummary, b: PostSummary): boolean {
  // Keep this in sync with PostSummary fields to avoid stale comparisons.
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.status === b.status &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a.archivedAt === b.archivedAt &&
    a.assetCount === b.assetCount &&
    a.variantCount === b.variantCount &&
    a.thumbnail === b.thumbnail &&
    destinationsEqual(a.destinations, b.destinations)
  );
}

function reconcilePostSummaries(
  prev: PostSummary[],
  incoming: PostSummary[],
): PostSummary[] {
  let changed = prev.length !== incoming.length;
  const prevById = new Map(prev.map((post) => [post.id, post]));

  const next = incoming.map((post) => {
    const current = prevById.get(post.id);
    if (!current) {
      changed = true;
      return post;
    }

    if (summariesEqual(current, post)) {
      return current;
    }

    changed = true;
    return post;
  });

  if (!changed) {
    for (let index = 0; index < next.length; index += 1) {
      if (next[index] !== prev[index]) {
        changed = true;
        break;
      }
    }
  }

  return changed ? next : prev;
}

export function usePostContext() {
  const ctx = useContext(PostContext);
  if (!ctx) throw new Error("usePostContext must be used within PostProvider");
  return ctx;
}

export function PostProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<PostSummary[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [activePost, dispatch] = useReducer(postReducer, null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const refreshPostsRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const { saveStatus, saveNow, markSaved, lastSavedRef } = useAutoSave(activePost, {
    onSaved: () => void refreshPostsRef.current?.(),
  });

  // Stable refs for callbacks that need latest values without re-creating
  const saveNowRef = useRef(saveNow);
  const markSavedRef = useRef(markSaved);
  const activePostIdRef = useRef<string | null>(null);
  const selectRequestSeqRef = useRef(0);

  useEffect(() => {
    saveNowRef.current = saveNow;
    markSavedRef.current = markSaved;
    activePostIdRef.current = activePost?.id ?? null;
  });

  const didInitialLoadRef = useRef(false);

  const refreshPosts = useCallback(async () => {
    // Only show skeletons on the very first load
    const isInitial = !didInitialLoadRef.current;
    if (isInitial) setIsLoadingPosts(true);
    try {
      console.log("[post:list:client] fetching posts…");
      const res = await fetch("/api/posts", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[post:list:client] failed ${res.status}`, body);
        return;
      }
      const json = await res.json();
      const incoming = (json.posts ?? []) as PostSummary[];
      console.log(`[post:list:client] loaded ${incoming.length} posts`);
      setPosts((current) => reconcilePostSummaries(current, incoming));
      didInitialLoadRef.current = true;
    } catch (err) {
      console.error("[post:list:client] network error", err);
    } finally {
      if (isInitial) setIsLoadingPosts(false);
    }
  }, []);

  const refreshArchivedPosts = useCallback(async () => {
    try {
      console.log("[post:list-archived:client] fetching archived posts…");
      const res = await fetch("/api/posts?archived=true", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[post:list-archived:client] failed ${res.status}`, body);
        return;
      }
      const json = await res.json();
      const incoming = (json.posts ?? []) as PostSummary[];
      console.log(`[post:list-archived:client] loaded ${incoming.length} archived posts`);
      setArchivedPosts((current) => reconcilePostSummaries(current, incoming));
    } catch (err) {
      console.error("[post:list-archived:client] network error", err);
    }
  }, []);

  useEffect(() => {
    refreshPostsRef.current = refreshPosts;
  }, [refreshPosts]);

  const notifyBeforePostSwitch = useCallback((toPostId: string | null) => {
    const fromPostId = activePostIdRef.current;
    if (fromPostId === toPostId) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("ig:before-post-switch", {
        detail: { fromPostId, toPostId },
      }),
    );
  }, []);

  // Load posts on mount
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void refreshPosts();
  }, [refreshPosts]);

  const selectPost = useCallback(
    async (id: string) => {
      if (activePostIdRef.current === id) {
        return;
      }

      console.log(`[post:select:client] selecting post ${id}`);
      notifyBeforePostSwitch(id);
      const requestSeq = ++selectRequestSeqRef.current;
      await saveNowRef.current();

      try {
        const res = await fetch(`/api/posts/${id}`, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(`[post:select:client] failed ${res.status} for ${id}`, body);
          return;
        }
        const row = await res.json();
        if (requestSeq !== selectRequestSeqRef.current) {
          console.log(`[post:select:client] stale request for ${id}, ignoring`);
          return;
        }
        console.log(`[post:select:client] loaded post ${id}`, { status: row.status, title: row.title });
        dispatch({ type: "LOAD_POST", row: row as PostRowWithDestinations });
        // markSaved is called in a separate effect that fires after LOAD_POST
        // updates the draft, ensuring the snapshot matches the loaded state

        const url = new URL(window.location.href);
        url.searchParams.set("post", id);
        window.history.replaceState({}, "", url.toString());
      } catch (err) {
        console.error(`[post:select:client] network error for ${id}`, err);
      }
    },
    [notifyBeforePostSwitch],
  );

  const createNewPost = useCallback(async (): Promise<string> => {
    console.log("[post:create:client] creating new post…");
    notifyBeforePostSwitch(null);
    selectRequestSeqRef.current += 1;
    await saveNowRef.current();

    // Fetch default brand from settings to pre-fill
    let brand = null;
    let promptConfig = null;
    let logoUrl = null;
    try {
      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings?.brand) brand = settings.brand;
        if (settings?.promptConfig) promptConfig = settings.promptConfig;
        if (settings?.logoUrl) logoUrl = settings.logoUrl;
      } else {
        console.warn(`[post:create:client] settings fetch failed ${settingsRes.status}`);
      }
    } catch (err) {
      console.warn("[post:create:client] settings fetch error, proceeding without brand", err);
    }

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, promptConfig, logoUrl }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[post:create:client] POST /api/posts failed ${res.status}`, body);
      throw new Error(`Failed to create post: ${res.status}`);
    }
    const json = await res.json();
    const id = json.id as string;
    console.log(`[post:create:client] created post ${id}`);

    dispatch({ type: "LOAD_POST", row: json.post as PostRowWithDestinations });
    // markSaved is called in a separate effect that fires after LOAD_POST
    // updates the draft, ensuring the snapshot matches the loaded state

    const url = new URL(window.location.href);
    url.searchParams.set("post", id);
    window.history.replaceState({}, "", url.toString());

    await refreshPosts();
    return id;
  }, [notifyBeforePostSwitch, refreshPosts]);

  const duplicatePost = useCallback(async (id: string): Promise<string> => {
    await saveNowRef.current();

    const res = await fetch(`/api/posts/${id}/duplicate`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error("Failed to duplicate post");
    }

    const json = DuplicatePostResponseSchema.parse(await res.json());
    const duplicatedId = json.id;

    dispatch({ type: "LOAD_POST", row: json.post as PostRowWithDestinations });

    const url = new URL(window.location.href);
    url.searchParams.set("post", duplicatedId);
    window.history.replaceState({}, "", url.toString());

    await refreshPosts();
    return duplicatedId;
  }, [refreshPosts]);

  const archivePost = useCallback(
    async (id: string) => {
      console.log(`[post:archive:client] archiving post ${id}…`);
      const res = await fetch(`/api/posts/${id}/archive`, { method: "POST" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[post:archive:client] failed ${res.status} for ${id}`, body);
        throw new Error(`Failed to archive post: ${res.status} ${body}`);
      }
      console.log(`[post:archive:client] archived post ${id} successfully`);
      await refreshPosts();
      void refreshArchivedPosts();

      if (activePostIdRef.current === id) {
        dispatch({ type: "SET_DRAFT", draft: null });
        const url = new URL(window.location.href);
        url.searchParams.delete("post");
        window.history.replaceState({}, "", url.toString());
      }
    },
    [refreshPosts, refreshArchivedPosts],
  );

  const deletePost = useCallback(
    async (id: string) => {
      console.log(`[post:delete:client] deleting post ${id}…`);
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[post:delete:client] failed ${res.status} for ${id}`, body);
        throw new Error(`Failed to delete post: ${res.status} ${body}`);
      }
      console.log(`[post:delete:client] deleted post ${id} successfully`);
      await refreshPosts();

      if (activePostIdRef.current === id) {
        dispatch({ type: "SET_DRAFT", draft: null });
        const url = new URL(window.location.href);
        url.searchParams.delete("post");
        window.history.replaceState({}, "", url.toString());
      }
    },
    [refreshPosts],
  );

  // Mark as saved whenever a new post is loaded (syncs auto-save snapshot)
  const prevPostIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = activePost?.id ?? null;
    if (currentId && currentId !== prevPostIdRef.current) {
      markSaved();
    }
    prevPostIdRef.current = currentId;
  }, [activePost?.id, markSaved]);

  // Load post from URL on mount, or auto-select first post when list loads
  const didLoadUrlRef = useRef(false);
  useEffect(() => {
    if (didLoadUrlRef.current) return;
    didLoadUrlRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const postId = params.get("post");
    if (postId) {
      void selectPost(postId);
    }
  }, [selectPost]);

  // Auto-select the first post when no post is active and the list is non-empty.
  // This covers initial load AND when the active post is archived/deleted.
  const isAutoSelectingRef = useRef(false);
  useEffect(() => {
    if (activePost || posts.length === 0 || isAutoSelectingRef.current) return;
    // Don't auto-select if URL already specifies a post (initial load handles that)
    const params = new URLSearchParams(window.location.search);
    if (params.get("post")) return;
    isAutoSelectingRef.current = true;
    void selectPost(posts[0].id).finally(() => {
      isAutoSelectingRef.current = false;
    });
  }, [posts, activePost, selectPost]);

  // beforeunload — flush save using keepalive fetch (survives page close)
  // Assign draftRef during render (not in useEffect) so the latest value is
  // always available even if the browser fires beforeunload before effects run.
  const draftRef = useRef(activePost);
  draftRef.current = activePost;
  useEffect(() => {
    const handler = () => {
      const d = draftRef.current;
      if (!d || d.status === "posted") return;
      const body = serializePostDraft(d);
      // Skip if nothing changed since last save
      if (body === lastSavedRef.current) return;
      fetch(`/api/posts/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [lastSavedRef]);

  const toggleSidebar = useCallback(() => setIsSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  const value = useMemo<PostContextValue>(
    () => ({
      posts,
      archivedPosts,
      isLoadingPosts,
      refreshPosts,
      refreshArchivedPosts,
      activePost,
      dispatch,
      selectPost,
      createNewPost,
      duplicatePost,
      archivePost,
      deletePost,
      saveStatus,
      saveNow,
      isSidebarOpen,
      toggleSidebar,
      closeSidebar,
    }),
    [
      posts,
      archivedPosts,
      isLoadingPosts,
      refreshPosts,
      refreshArchivedPosts,
      activePost,
      selectPost,
      createNewPost,
      duplicatePost,
      archivePost,
      deletePost,
      saveStatus,
      saveNow,
      isSidebarOpen,
      toggleSidebar,
      closeSidebar,
    ],
  );

  return <PostContext.Provider value={value}>{children}</PostContext.Provider>;
}
