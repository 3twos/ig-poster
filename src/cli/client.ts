import { CliError, EXIT_CODES, exitCodeFromStatus } from "./errors";

type RequestOptions = {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type ApiEnvelopeError = {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type ClientOptions = {
  host: string;
  token?: string;
  timeoutMs: number;
};

export class IgPosterClient {
  readonly host: string;
  readonly token?: string;
  readonly timeoutMs: number;

  constructor(options: ClientOptions) {
    this.host = options.host.replace(/\/+$/, "");
    this.token = options.token;
    this.timeoutMs = options.timeoutMs;
  }

  async requestJson<T>(options: RequestOptions): Promise<T> {
    const response = await this.request(options);
    return response.data as T;
  }

  async request(options: RequestOptions): Promise<{
    status: number;
    data: unknown;
    headers: Headers;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(options.headers);
      if (this.token) {
        headers.set("authorization", `Bearer ${this.token}`);
      }

      let body: string | undefined;
      if (options.body !== undefined) {
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
        body =
          typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
      }

      const response = await fetch(`${this.host}${normalizePath(options.path)}`, {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const raw = await response.text();
      const data =
        contentType.includes("application/json") && raw
          ? (JSON.parse(raw) as unknown)
          : raw;

      if (!response.ok) {
        throw buildHttpError(response.status, data);
      }

      return {
        status: response.status,
        data,
        headers: response.headers,
      };
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new CliError(
          `Request timed out after ${this.timeoutMs}ms`,
          EXIT_CODES.transport,
        );
      }

      throw new CliError(
        error instanceof Error ? error.message : "Network request failed",
        EXIT_CODES.transport,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

const normalizePath = (value: string) =>
  value.startsWith("/") ? value : `/${value}`;

const buildHttpError = (status: number, data: unknown) => {
  const envelope = data as ApiEnvelopeError;
  const message =
    envelope?.error?.message ??
    (typeof data === "string" && data ? data : `Request failed with ${status}`);

  return new CliError(message, exitCodeFromStatus(status));
};
