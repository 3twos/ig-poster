import { NextResponse } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

/**
 * An error whose message is safe to show to end users in any environment.
 * Use this for actionable, user-facing error messages that should not be
 * replaced by a generic fallback in production.
 */
export class ClientSafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientSafeError";
  }
}

/**
 * Return a safe error detail string.
 * In development, returns the full error message.
 * In production, returns the provided fallback — unless the error is a
 * ClientSafeError, in which case its message always passes through.
 */
export const safeErrorDetail = (
  error: unknown,
  fallback = "An unexpected error occurred",
): string => {
  if (error instanceof ClientSafeError) {
    return error.message;
  }
  if (isDev && error instanceof Error) {
    return error.message;
  }
  return fallback;
};

/**
 * Build a sanitized JSON error response.
 */
export const apiErrorResponse = (
  error: unknown,
  options: { fallback?: string; status?: number } = {},
) => {
  const { fallback = "An unexpected error occurred", status = 500 } = options;
  const detail =
    error instanceof Error ? error.message : undefined;
  return NextResponse.json(
    { error: fallback, ...(detail ? { detail } : {}) },
    { status },
  );
};
