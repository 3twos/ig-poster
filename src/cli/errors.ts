export const EXIT_CODES = {
  ok: 0,
  usage: 2,
  auth: 3,
  forbidden: 4,
  notFound: 5,
  conflict: 6,
  upstream: 7,
  transport: 8,
  partial: 9,
} as const;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_CODES.usage) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export const exitCodeFromStatus = (status: number) => {
  if (status === 400) return EXIT_CODES.usage;
  if (status === 401) return EXIT_CODES.auth;
  if (status === 403) return EXIT_CODES.forbidden;
  if (status === 404) return EXIT_CODES.notFound;
  if (status === 409) return EXIT_CODES.conflict;
  if (status >= 500) return EXIT_CODES.upstream;
  return EXIT_CODES.transport;
};

export const errorCodeFromExitCode = (exitCode: number) => {
  if (exitCode === EXIT_CODES.usage) return "INVALID_INPUT";
  if (exitCode === EXIT_CODES.auth) return "AUTH_REQUIRED";
  if (exitCode === EXIT_CODES.forbidden) return "FORBIDDEN";
  if (exitCode === EXIT_CODES.notFound) return "NOT_FOUND";
  if (exitCode === EXIT_CODES.conflict) return "CONFLICT";
  if (exitCode === EXIT_CODES.upstream) return "UPSTREAM_ERROR";
  if (exitCode === EXIT_CODES.partial) return "PARTIAL_SUCCESS";
  return "TRANSPORT_ERROR";
};
