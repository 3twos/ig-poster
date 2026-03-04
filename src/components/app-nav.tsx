"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { WorkspaceAuthStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Create" },
  { href: "/brand", label: "Brand Kit" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-orange-200 uppercase">
          <Sparkles className="h-4 w-4" />
          IG Poster
        </div>

        <nav className="flex gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  isActive
                    ? "bg-orange-400/15 text-orange-200"
                    : "text-slate-300 hover:bg-white/10 hover:text-white",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {workspaceAuth?.authenticated ? (
        <span className="inline-flex items-center gap-2 text-xs text-slate-200">
          <span>{workspaceAuth.user?.email ?? "Workspace user"}</span>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            disabled={isSigningOut}
            className="inline-flex items-center gap-1 rounded-full border border-white/25 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSigningOut ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : null}
            Sign out
          </button>
        </span>
      ) : null}
    </div>
  );
}
