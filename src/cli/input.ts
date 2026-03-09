import { readFile } from "node:fs/promises";

const readStdin = async () => {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

export const readTextInput = async (value: string) => {
  if (value === "-") {
    return readStdin();
  }

  if (value.startsWith("@")) {
    return readFile(value.slice(1), "utf8");
  }

  return value;
};

export const readJsonInput = async <T>(value: string) =>
  JSON.parse(await readTextInput(value)) as T;
