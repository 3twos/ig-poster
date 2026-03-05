"use client";

import { PostProvider } from "@/contexts/post-context";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <PostProvider>
        <KeyboardShortcutsProvider />
        <CommandPalette />
        {children}
      </PostProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
