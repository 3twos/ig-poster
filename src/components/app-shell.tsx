"use client";

import { AppNav } from "@/components/app-nav";
import { AppStatusBar } from "@/components/app-status-bar";

export function AppShell({
  children,
  showFooterStatusBar = true,
}: {
  children: React.ReactNode;
  showFooterStatusBar?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_0%_0%,#1E293B_0%,#0F172A_35%,#020617_100%)] text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-orange-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
      >
        Skip to main content
      </a>
      <AppNav />
      <main id="main-content" className="min-w-0 flex-1">
        {children}
      </main>
      {showFooterStatusBar ? <AppStatusBar /> : null}
    </div>
  );
}
