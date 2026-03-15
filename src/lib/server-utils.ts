import { createHash } from "node:crypto";

export const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export const isAbortError = (error: unknown) =>
  error instanceof Error &&
  (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

export const toErrorMessage = (error: unknown, fallback = "Unexpected error") =>
  error instanceof Error ? error.message : fallback;

/**
 * Build a JSON-safe error detail object for 500 responses.
 * Includes message and stack so the browser Network tab
 * can reveal what Vercel runtime logs truncate.
 */
export const buildErrorDetail = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return { message: String(error) };
};
