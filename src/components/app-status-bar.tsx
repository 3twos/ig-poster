"use client";

import { useSyncExternalStore } from "react";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

let cachedTime = "";
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  const tick = () => {
    cachedTime = formatDateTime(new Date());
    listeners.forEach((l) => l());
  };
  tick();
  setInterval(tick, 60_000);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return cachedTime;
}

function getServerSnapshot() {
  return "";
}

export function AppStatusBar() {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <footer className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-500 md:px-8">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between">
        <span>IG Poster v{APP_VERSION}</span>
        {now && <span>{now}</span>}
      </div>
    </footer>
  );
}
