"use client";

import { AppNav } from "@/components/app-nav";
import { MobileSidebarDrawer, PostSidebar } from "@/components/post-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#1E293B_0%,#0F172A_35%,#020617_100%)] px-4 py-6 text-white md:px-8 md:py-8">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-orange-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900"
      >
        Skip to main content
      </a>
      <div className="mx-auto max-w-[1440px]">
        <AppNav />
        <div className="flex gap-6">
          <PostSidebar />
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
      <MobileSidebarDrawer />
    </div>
  );
}
