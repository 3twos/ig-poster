import type { MetaUserTag } from "@/lib/meta-schemas";

const parseCoordinate = (
  rawValue: string | undefined,
  axis: "x" | "y",
  lineNumber: number,
) => {
  const trimmedValue = rawValue?.trim() ?? "";
  if (!trimmedValue) {
    throw new Error(`User tag line ${lineNumber} is missing ${axis} value.`);
  }

  const parsed = Number(trimmedValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`User tag line ${lineNumber} has invalid ${axis} value.`);
  }

  return parsed;
};

export const parseMetaUserTagsText = (raw?: string): MetaUserTag[] | undefined => {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(",").map((part) => part.trim());
      if (parts.length !== 3) {
        throw new Error(
          `User tag line ${index + 1} must use "username,x,y" format.`,
        );
      }

      const username = parts[0]?.replace(/^@/, "");
      if (!username) {
        throw new Error(`User tag line ${index + 1} is missing a username.`);
      }

      const x = parseCoordinate(parts[1], "x", index + 1);
      const y = parseCoordinate(parts[2], "y", index + 1);

      return { username, x, y };
    });
};

export const formatMetaUserTagsText = (
  tags: MetaUserTag[] | null | undefined,
) =>
  (tags ?? [])
    .map((tag) => `${tag.username},${tag.x},${tag.y}`)
    .join("\n");
