"use client";

import { PostProvider } from "@/contexts/post-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <PostProvider>{children}</PostProvider>;
}
