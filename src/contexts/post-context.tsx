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
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [activePost, dispatch] = useReducer(postReducer, null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const refreshPostsRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const { saveStatus, saveNow, markSaved } = useAutoSave(activePost, {
    onSaved: () => void refreshPostsRef.current?.(),
  });

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
    setIsLoadingPosts(true);
    try {
      const res = await fetch("/api/posts", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setPosts(json.posts ?? []);
    } catch {
      // Silently fail — sidebar will show empty
    } finally {
      setIsLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    refreshPostsRef.current = refreshPosts;
  }, [refreshPosts]);

  // Load posts on mount
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void refreshPosts();
  }, [refreshPosts]);

  const selectPost = useCallback(
    async (id: string) => {
      await saveNowRef.current();

      try {
        const res = await fetch(`/api/posts/${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const row = await res.json();
        dispatch({ type: "LOAD_POST", row });
        // markSaved is called in a separate effect that fires after LOAD_POST
        // updates the draft, ensuring the snapshot matches the loaded state

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
    if (!res.ok) {
      throw new Error("Failed to create post");
    }
    const json = await res.json();
    const id = json.id as string;

    dispatch({ type: "LOAD_POST", row: json.post });
    // markSaved is called in a separate effect that fires after LOAD_POST
    // updates the draft, ensuring the snapshot matches the loaded state

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
        dispatch({ type: "SET_DRAFT", draft: null });
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

  // beforeunload — flush save using keepalive fetch (survives page close)
  const draftRef = useRef(activePost);
  useEffect(() => {
    draftRef.current = activePost;
  });
  useEffect(() => {
    const handler = () => {
      const d = draftRef.current;
      if (!d) return;
      const { activeSlideIndex: _, ...rest } = d;
      const body = JSON.stringify(rest);
      fetch(`/api/posts/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
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
