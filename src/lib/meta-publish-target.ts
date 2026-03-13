import { z } from "zod";

import type { MetaDestination } from "@/lib/meta-accounts";

export const BrowserPublishTargetSchema = z.enum([
  "facebook",
  "instagram",
  "both",
]);

export type BrowserPublishTarget = z.infer<typeof BrowserPublishTargetSchema>;

export const expandBrowserPublishTarget = (
  target: BrowserPublishTarget,
): MetaDestination[] =>
  target === "both" ? ["facebook", "instagram"] : [target];

export const getBrowserPublishTargetLabel = (
  target: BrowserPublishTarget,
): string => {
  if (target === "both") {
    return "Facebook + Instagram";
  }

  return target === "facebook" ? "Facebook" : "Instagram";
};
