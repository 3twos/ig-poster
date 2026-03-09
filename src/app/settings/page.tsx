"use client";

import { BrainCircuit, KeyRound, Palette } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useCallback } from "react";

import { AppShell } from "@/components/app-shell";
import { BrandKitsSection } from "@/components/settings/brand-kits-section";
import { GeneralSection } from "@/components/settings/general-section";
import { LlmProviderSection } from "@/components/settings/llm-provider-section";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "general", label: "General", icon: KeyRound },
  { id: "llm", label: "LLM Provider", icon: BrainCircuit },
  { id: "brand-kits", label: "Brand Kits", icon: Palette },
] as const;

type TabId = (typeof TABS)[number]["id"];

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab");
  const activeTab: TabId = TABS.some((t) => t.id === rawTab)
    ? (rawTab as TabId)
    : "general";

  const setTab = useCallback(
    (tab: TabId) => {
      router.replace(`/settings?tab=${tab}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="flex h-[calc(100dvh-49px)]">
      {/* Sidebar */}
      <div className="flex w-52 shrink-0 flex-col border-r border-white/10">
        <div className="border-b border-white/10 px-5 py-4">
          <h1 className="text-lg font-semibold text-white">Settings</h1>
        </div>
        <nav className="space-y-1 p-3">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition",
                  activeTab === tab.id
                    ? "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "general" && (
          <div className="mx-auto max-w-2xl p-6">
            <GeneralSection />
          </div>
        )}
        {activeTab === "llm" && (
          <div className="mx-auto max-w-2xl p-6">
            <LlmProviderSection />
          </div>
        )}
        {activeTab === "brand-kits" && <BrandKitsSection />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell showFooterStatusBar={false}>
      <Suspense>
        <SettingsContent />
      </Suspense>
    </AppShell>
  );
}
