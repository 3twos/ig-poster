"use client";

import { Command, EllipsisVertical, LoaderCircle, PanelLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePostContext } from "@/contexts/post-context";
import type { WorkspaceAuthStatus } from "@/lib/types";

const NAV_LINKS = [
  { href: "/", label: "Create" },
  { href: "/brand", label: "Brand Kit" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const { toggleSidebar } = usePostContext();
  const [workspaceAuth, setWorkspaceAuth] =
    useState<WorkspaceAuthStatus | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadWorkspaceStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/google/status", {
        cache: "no-store",
      });
      if (!response.ok) {
        setWorkspaceAuth(null);
        return;
      }

      const json = (await response.json()) as WorkspaceAuthStatus;
      setWorkspaceAuth(json);
    } catch {
      setWorkspaceAuth(null);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceStatus();
  }, [loadWorkspaceStatus]);

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/google/logout", { method: "POST" });
    } finally {
      window.location.href = "/api/auth/google/start";
    }
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {/* Mobile sidebar toggle (post list drawer) */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          className="text-slate-300 hover:text-white lg:hidden"
          aria-label="Toggle post list"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>

        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-200 uppercase">
          <Sparkles className="h-4 w-4" />
          IG Poster
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true }),
            );
          }}
          className="hidden gap-1.5 text-[11px] text-slate-400 md:inline-flex"
          aria-label="Open command palette (⌘K)"
        >
          <Command className="h-3 w-3" />
          <span>K</span>
        </Button>

        {workspaceAuth?.authenticated && (
          <span className="text-xs text-slate-200">
            {workspaceAuth.user?.email ?? "Workspace user"}
          </span>
        )}

        {/* Hamburger menu for navigation + sign out */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-slate-300 hover:text-white"
              aria-label="Open navigation menu"
            >
              <EllipsisVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <DropdownMenuItem key={link.href} asChild>
                  <Link
                    href={link.href}
                    className={isActive ? "font-semibold text-orange-200" : ""}
                  >
                    {link.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            {workspaceAuth?.authenticated && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    void signOut();
                  }}
                  disabled={isSigningOut}
                >
                  {isSigningOut && (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  )}
                  Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
