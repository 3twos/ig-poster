"use client";

import {
  FileText,
  LayoutDashboard,
  Palette,
  Plus,
  Settings,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { usePostContext } from "@/contexts/post-context";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { posts, selectPost, createNewPost, activePost } = usePostContext();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const openFromEvent = () => setOpen(true);

    document.addEventListener("keydown", down);
    window.addEventListener("ig:open-command-palette", openFromEvent);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("ig:open-command-palette", openFromEvent);
    };
  }, []);

  const runAction = useCallback(
    (fn: () => void | Promise<void>) => {
      setOpen(false);
      void fn();
    },
    [],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search posts..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              runAction(async () => {
                await createNewPost();
                router.push("/");
              })
            }
          >
            <Plus className="h-4 w-4" />
            <span>New Post</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          {activePost && (
            <CommandItem
              onSelect={() =>
                runAction(() => {
                  // Dispatch a custom event that page.tsx listens for
                  window.dispatchEvent(new CustomEvent("ig:generate"));
                })
              }
            >
              <WandSparkles className="h-4 w-4" />
              <span>Generate Concepts</span>
              <CommandShortcut>G</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => runAction(() => router.push("/"))}>
            <LayoutDashboard className="h-4 w-4" />
            <span>Posts</span>
          </CommandItem>
          <CommandItem onSelect={() => runAction(() => router.push("/settings?tab=brand-kits"))}>
            <Palette className="h-4 w-4" />
            <span>Brand Kits</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runAction(() => router.push("/settings"))}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        {posts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Posts">
              {posts.slice(0, 15).map((post) => (
                <CommandItem
                  key={post.id}
                  onSelect={() =>
                    runAction(async () => {
                      await selectPost(post.id);
                      router.push("/");
                    })
                  }
                >
                  <FileText className="h-4 w-4" />
                  <span>{post.title || "Untitled Post"}</span>
                  <CommandShortcut className="text-[10px] opacity-50">
                    {post.status}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
