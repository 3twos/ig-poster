"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { usePostContext } from "@/contexts/post-context";

/**
 * Global keyboard shortcuts. Only active when no input/textarea is focused.
 *
 * N — New post
 * G — Generate (dispatches custom event)
 * E — Toggle editor mode (dispatches custom event)
 * 1/2/3 — Select variant (dispatches custom event)
 * ↑/↓ — Navigate post list
 * Enter — Select highlighted post (handled by post list focus)
 * Cmd+S — Force save
 * Esc — Close sidebar on mobile
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { posts, activePost, selectPost, createNewPost, saveNow, closeSidebar } =
    usePostContext();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Cmd+S — save (works even in inputs)
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void saveNow();
        return;
      }

      // Don't handle other shortcuts when typing in an input
      if (isInput) return;

      // Don't handle if modifier keys are held (except for Cmd+S above)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "n":
        case "N": {
          e.preventDefault();
          void createNewPost().then(() => {
            if (pathname !== "/") router.push("/");
          });
          break;
        }

        case "g":
        case "G": {
          if (activePost && pathname === "/") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("ig:generate"));
          }
          break;
        }

        case "e":
        case "E": {
          if (activePost && pathname === "/") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("ig:toggle-editor"));
          }
          break;
        }

        case "1":
        case "2":
        case "3": {
          if (activePost && pathname === "/") {
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent("ig:select-variant", {
                detail: { index: Number(e.key) - 1 },
              }),
            );
          }
          break;
        }

        case "ArrowUp": {
          e.preventDefault();
          const currentIdx = posts.findIndex((p) => p.id === activePost?.id);
          const prevIdx = currentIdx > 0 ? currentIdx - 1 : posts.length - 1;
          if (posts[prevIdx]) {
            void selectPost(posts[prevIdx].id);
          }
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          const currentIdx2 = posts.findIndex((p) => p.id === activePost?.id);
          const nextIdx = currentIdx2 < posts.length - 1 ? currentIdx2 + 1 : 0;
          if (posts[nextIdx]) {
            void selectPost(posts[nextIdx].id);
          }
          break;
        }

        case "Escape": {
          closeSidebar();
          break;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    activePost,
    closeSidebar,
    createNewPost,
    pathname,
    posts,
    router,
    saveNow,
    selectPost,
  ]);
}
