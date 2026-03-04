import { createHash } from "node:crypto";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export const isAbortError = (error: unknown) =>
  error instanceof Error &&
  (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

export const toErrorMessage = (error: unknown, fallback = "Unexpected error") =>
  error instanceof Error ? error.message : fallback;

export const hexToRgba = (hex: string, alpha: number) => {
  const a = Math.max(0, Math.min(1, alpha));
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(15,23,42,${a})`;
  }

  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
