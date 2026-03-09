import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type ApiSuccessEnvelope<T> = {
  ok: true;
  data: T;
};

export type ApiErrorEnvelope = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export const apiOk = <T>(data: T, init?: ResponseInit) =>
  NextResponse.json<ApiSuccessEnvelope<T>>({ ok: true, data }, init);

export const apiError = (
  status: number,
  code: ApiErrorCode,
  message: string,
) =>
  NextResponse.json<ApiErrorEnvelope>(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
