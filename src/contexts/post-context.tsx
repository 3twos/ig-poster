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
import {
  postReducer,
  type PostAction,
  type PostDraft,
} from "@/hooks/use-post-reducer";
import { useAutoSave, type SaveStatus } from "@/hooks/use-auto-save";

type PostContextValue = {
  // Sidebar
  posts: PostSummary[];
  isLoadingPosts: boolean;
  refreshPosts: () => Promise<void>;

  // Active post
  activePost: PostDraft | null;
  dispatch: React.Dispatch<PostAction>;

  // Navigation
  selectPost: (id: string) => Promise<void>;
  createNewPost: () => Promise<string>;
  archivePost: (id: string) => Promise<void>;
  deletePost: (id: string) => Promise<void>;

  // Save
  saveStatus: SaveStatus;
  saveNow: () => Promise<void>;

  // Mobile
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
};

const PostContext = createContext<PostContextValue | null>(null);

export function usePostContext() {
  const ctx = useContext(PostContext);
  if (!ctx) throw new Error("usePostContext must be used within PostProvider");
  return ctx;
}

export function PostProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [activePost, dispatch] = useReducer(postReducer, null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { saveStatus, saveNow, markSaved } = useAutoSave(activePost);

  // Stable refs for callbacks that need latest values without re-creating
  const saveNowRef = useRef(saveNow);
  const markSavedRef = useRef(markSaved);
  const activePostIdRef = useRef<string | null>(null);

  useEffect(() => {
    saveNowRef.current = saveNow;
    markSavedRef.current = markSaved;
    activePostIdRef.current = activePost?.id ?? null;
  });

  const refreshPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/posts", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setPosts(json.posts ?? []);
    } catch {
      // Silently fail — sidebar will show empty
    }
  }, []);

  // Load posts on mount
  const initPromiseRef = useRef<Promise<void> | null>(null);
  if (initPromiseRef.current === null) {
    initPromiseRef.current = refreshPosts().finally(() =>
      setIsLoadingPosts(false),
    );
  }

  const selectPost = useCallback(
    async (id: string) => {
      await saveNowRef.current();

      try {
        const res = await fetch(`/api/posts/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const row = await res.json();
        dispatch({ type: "LOAD_POST", row });
        markSavedRef.current();

        const url = new URL(window.location.href);
        url.searchParams.set("post", id);
        window.history.replaceState({}, "", url.toString());
      } catch {
        // Failed to load post
      }
    },
    [], // Stable — uses refs
  );

  const createNewPost = useCallback(async (): Promise<string> => {
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
      }
    } catch {
      // Proceed without brand pre-fill
    }

    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, promptConfig, logoUrl }),
    });
    const json = await res.json();
    const id = json.id as string;

    dispatch({ type: "LOAD_POST", row: json.post });
    markSavedRef.current();

    const url = new URL(window.location.href);
    url.searchParams.set("post", id);
    window.history.replaceState({}, "", url.toString());

    await refreshPosts();
    return id;
  }, [refreshPosts]);

  const archivePost = useCallback(
    async (id: string) => {
      await fetch(`/api/posts/${id}/archive`, { method: "POST" });
      await refreshPosts();

      if (activePostIdRef.current === id) {
        dispatch({ type: "SET_DRAFT", draft: null as unknown as PostDraft });
        const url = new URL(window.location.href);
        url.searchParams.delete("post");
        window.history.replaceState({}, "", url.toString());
      }
    },
    [refreshPosts],
  );

  const deletePost = useCallback(
    async (id: string) => {
      await fetch(`/api/posts/${id}`, { method: "DELETE" });
      await refreshPosts();

      if (activePostIdRef.current === id) {
        dispatch({ type: "SET_DRAFT", draft: null as unknown as PostDraft });
        const url = new URL(window.location.href);
        url.searchParams.delete("post");
        window.history.replaceState({}, "", url.toString());
      }
    },
    [refreshPosts],
  );

  // Load post from URL on mount (one-time)
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

  // beforeunload — flush save
  useEffect(() => {
    const handler = () => {
      if (activePostIdRef.current) {
        void saveNowRef.current();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const toggleSidebar = useCallback(() => setIsSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  const value = useMemo<PostContextValue>(
    () => ({
      posts,
      isLoadingPosts,
      refreshPosts,
      activePost,
      dispatch,
      selectPost,
      createNewPost,
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
      isLoadingPosts,
      refreshPosts,
      activePost,
      selectPost,
      createNewPost,
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
