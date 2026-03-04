import type { PostRow } from "@/db/schema";

export type PostStatus =
  | "draft"
  | "generated"
  | "published"
  | "scheduled"
  | "archived";

export type PostSummary = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assetCount: number;
  variantCount: number;
};

export function deriveTitle(
  post: Pick<PostRow, "brief" | "title">,
): string {
  const brief = post.brief as Record<string, unknown> | null;
  if (brief?.subject && typeof brief.subject === "string") return brief.subject;
  if (post.title) return post.title;
  if (brief?.theme && typeof brief.theme === "string") return brief.theme;
  return "Untitled Post";
}

export function toSummary(row: PostRow): PostSummary {
  const result = row.result as Record<string, unknown> | null;
  const variants = Array.isArray(result?.variants) ? result.variants : [];

  return {
    id: row.id,
    title: deriveTitle(row),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assetCount: row.assets?.length ?? 0,
    variantCount: variants.length,
  };
}
