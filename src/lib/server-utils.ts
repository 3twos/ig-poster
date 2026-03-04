import { createHash } from "node:crypto";

export const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export const isAbortError = (error: unknown) =>
  error instanceof Error &&
  (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

export const toErrorMessage = (error: unknown, fallback = "Unexpected error") =>
  error instanceof Error ? error.message : fallback;
