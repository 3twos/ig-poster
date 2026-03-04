"use client";

import { AppNav } from "@/components/app-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#1E293B_0%,#0F172A_35%,#020617_100%)] px-4 py-6 text-white md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <AppNav />
        {children}
      </div>
    </main>
  );
}
