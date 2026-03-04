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
  thumbnail?: string;
};

export function deriveTitle(
  post: Pick<PostRow, "brief" | "title" | "result">,
): string {
  const brief = post.brief as Record<string, unknown> | null;
  if (brief?.subject && typeof brief.subject === "string") return brief.subject;
  if (post.title) return post.title;
  if (brief?.theme && typeof brief.theme === "string") return brief.theme;
  const result = post.result as Record<string, unknown> | null;
  const variants = Array.isArray(result?.variants) ? result.variants : [];
  const firstHeadline = (variants[0] as Record<string, unknown> | undefined)
    ?.headline;
  if (firstHeadline && typeof firstHeadline === "string")
    return firstHeadline.slice(0, 60);
  return "Untitled Post";
}

function deriveThumbnail(row: PostRow): string | undefined {
  if (row.renderedPosterUrl) return row.renderedPosterUrl;
  const assets = row.assets ?? [];
  if (assets.length > 0) {
    const first = assets[0] as Record<string, unknown>;
    return (
      (first.posterUrl as string | undefined) ??
      (first.url as string | undefined)
    );
  }
  return undefined;
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
    thumbnail: deriveThumbnail(row),
  };
}
