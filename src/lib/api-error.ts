import { NextResponse } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Return a safe error detail string.
 * In development, returns the full error message.
 * In production, returns the provided fallback.
 */
export const safeErrorDetail = (
  error: unknown,
  fallback = "An unexpected error occurred",
): string => {
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
  return NextResponse.json(
    { error: fallback, ...(isDev && error instanceof Error ? { detail: error.message } : {}) },
    { status },
  );
};
