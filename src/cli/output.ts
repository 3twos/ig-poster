import { inspect } from "node:util";

import { CliError, EXIT_CODES } from "./errors";

export const printJson = (value: unknown, jq?: string) => {
  const output = jq ? applyJq(value, jq) : value;
  process.stdout.write(
    `${JSON.stringify(output === undefined ? null : output, null, 2)}\n`,
  );
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

export const printKeyValue = (entries: Array<[string, string | undefined]>) => {
  printLines(entries.map(([key, value]) => `${key}: ${value ?? "-"}`));
};

export const printValue = (value: unknown) => {
  process.stdout.write(`${inspect(value, { depth: null, colors: false })}\n`);
};

const formatIso = (value: string) => value.replace("T", " ").replace(".000Z", "Z");

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
