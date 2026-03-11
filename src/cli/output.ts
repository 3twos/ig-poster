import { inspect } from "node:util";

import { CliError, EXIT_CODES } from "./errors";

export type JsonSuccessEnvelope<T> = {
  ok: true;
  data: T;
};

export type JsonErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    exitCode?: number;
  };
};

export const printJson = (value: unknown, jq?: string) => {
  const output = jq ? applyJq(value, jq) : value;
  process.stdout.write(
    `${JSON.stringify(output === undefined ? null : output, null, 2)}\n`,
  );
};

export const printJsonEnvelope = <T>(value: T, jq?: string) => {
  printJson(
    {
      ok: true,
      data: value,
    } satisfies JsonSuccessEnvelope<T>,
    jq,
  );
};

export const printJsonErrorEnvelope = (
  error: JsonErrorEnvelope["error"],
) => {
  printJson({
    ok: false,
    error,
  } satisfies JsonErrorEnvelope);
};

export const printStreamJsonEvent = (event: unknown) => {
  process.stdout.write(`${JSON.stringify(event)}\n`);
};

export const printLines = (lines: string[]) => {
  process.stdout.write(`${lines.join("\n")}\n`);
};

export const printPostsTable = (
  posts: Array<{ id: string; status: string; title: string; updatedAt: string }>,
) => {
  if (posts.length === 0) {
    printLines(["No posts found."]);
    return;
  }

  const rows = [
    ["ID", "STATUS", "UPDATED", "TITLE"],
    ...posts.map((post) => [
      post.id,
      post.status,
      formatIso(post.updatedAt),
      post.title,
    ]),
  ];

  printLines(rows.map(formatRow));
};

export const printBrandKitsTable = (
  brandKits: Array<{
    id: string;
    name: string;
    updatedAt: string;
    isDefault?: boolean;
  }>,
) => {
  if (brandKits.length === 0) {
    printLines(["No brand kits found."]);
    return;
  }

  const rows = [
    ["ID", "DEFAULT", "UPDATED", "NAME"],
    ...brandKits.map((brandKit) => [
      brandKit.id,
      brandKit.isDefault ? "yes" : "no",
      formatIso(brandKit.updatedAt),
      brandKit.name,
    ]),
  ];

  printLines(rows.map(formatRow));
};

export const printAssetsTable = (
  assets: Array<{
    name: string;
    folder: string;
    size: number;
    url: string;
  }>,
) => {
  if (assets.length === 0) {
    printLines(["No assets uploaded."]);
    return;
  }

  const rows = [
    ["NAME", "FOLDER", "SIZE", "URL"],
    ...assets.map((asset) => [
      asset.name,
      asset.folder,
      formatBytes(asset.size),
      asset.url,
    ]),
  ];

  printLines(rows.map(formatRow));
};

export const printQueueTable = (
  jobs: Array<{
    id: string;
    status: string;
    publishAt: string;
    attempts: number;
    maxAttempts: number;
    postId?: string | null;
  }>,
) => {
  if (jobs.length === 0) {
    printLines(["No publish jobs found."]);
    return;
  }

  const rows = [
    ["ID", "STATUS", "PUBLISH AT", "ATTEMPTS", "POST ID"],
    ...jobs.map((job) => [
      job.id,
      job.status,
      formatIso(job.publishAt),
      `${job.attempts}/${job.maxAttempts}`,
      job.postId ?? "-",
    ]),
  ];

  printLines(rows.map(formatRow));
};

export const printSessionsTable = (
  sessions: Array<{
    id: string;
    label: string;
    email: string;
    lastUsedAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>,
) => {
  if (sessions.length === 0) {
    printLines(["No CLI sessions found."]);
    return;
  }

  const rows = [
    ["ID", "REVOKED", "LAST USED", "EXPIRES", "LABEL", "EMAIL"],
    ...sessions.map((session) => [
      session.id,
      session.revokedAt ? "yes" : "no",
      formatIso(session.lastUsedAt),
      formatIso(session.expiresAt),
      session.label,
      session.email,
    ]),
  ];

  printLines(rows.map(formatRow));
};

export const printGenerationVariantsTable = (
  variants: Array<{
    id: string;
    name: string;
    postType: string;
    score?: number;
  }>,
) => {
  if (variants.length === 0) {
    printLines(["No variants generated."]);
    return;
  }

  const rows = [
    ["ID", "TYPE", "SCORE", "NAME"],
    ...variants.map((variant) => [
      variant.id,
      variant.postType,
      variant.score !== undefined ? String(variant.score) : "-",
      variant.name,
    ]),
  ];

  printLines(rows.map(formatRow));
};

export const printKeyValue = (entries: Array<[string, string | undefined]>) => {
  printLines(entries.map(([key, value]) => `${key}: ${value ?? "-"}`));
};

export const printValue = (value: unknown) => {
  process.stdout.write(`${inspect(value, { depth: null, colors: false })}\n`);
};

const formatIso = (value: string) => value.replace("T", " ").replace(".000Z", "Z");

const formatBytes = (value: number) => {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }
  return `${value}B`;
};

const formatRow = (columns: string[]) =>
  columns
    .map((column, index) => column.padEnd(index === columns.length - 1 ? column.length : 22))
    .join("");

const applyJq = (value: unknown, expression: string) => {
  if (expression === ".") {
    return value;
  }

  if (!expression.startsWith(".")) {
    throw new CliError(
      `Unsupported --jq expression: ${expression}`,
      EXIT_CODES.usage,
    );
  }

  return expression
    .slice(1)
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof current !== "object") {
        throw new CliError(
          `Unsupported --jq expression: ${expression}`,
          EXIT_CODES.usage,
        );
      }

      const record = current as Record<string, unknown>;
      return record[segment];
    }, value);
};
