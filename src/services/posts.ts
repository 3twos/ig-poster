import { and, asc, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { brandKits, posts } from "@/db/schema";
import { getPrimaryBrandKitLogoUrl } from "@/lib/brand-kit";
import { type PostStatus } from "@/lib/post";
import { type PostCreateRequest, PostCreateRequestSchema } from "@/lib/post-schemas";
import type { Actor } from "@/services/actors";

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 18);

export const listPosts = async (
  actor: Actor,
  options: {
    archived?: boolean;
    status?: PostStatus;
  } = {},
) => {
  const conditions = [eq(posts.ownerHash, actor.ownerHash)];

  if (options.status) {
    conditions.push(eq(posts.status, options.status));
  } else if (!options.archived) {
    conditions.push(ne(posts.status, "archived"));
  }

  const db = getDb();
  return db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.updatedAt))
    .limit(50);
};

export const getPost = async (actor: Actor, id: string) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.ownerHash, actor.ownerHash)))
    .limit(1);

  return row ?? null;
};

export const createPost = async (
  actor: Actor,
  input: PostCreateRequest,
) => {
  const body = PostCreateRequestSchema.parse(input);
  const id = randomId();
  const now = new Date();

  const db = getDb();
  let brandKitId = body.brandKitId ?? null;
  let brand = body.brand ?? null;
  let promptConfig = body.promptConfig ?? null;
  let logoUrl = body.logoUrl ?? null;

  if (!brandKitId) {
    const [firstBrandKit] = await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.ownerHash, actor.ownerHash))
      .orderBy(asc(brandKits.createdAt))
      .limit(1);

    if (firstBrandKit) {
      brandKitId = firstBrandKit.id;
      brand = firstBrandKit.brand ?? null;
      promptConfig = firstBrandKit.promptConfig ?? null;
      logoUrl = getPrimaryBrandKitLogoUrl(
        firstBrandKit.logos,
        firstBrandKit.logoUrl,
      );
    }
  }

  const [row] = await db
    .insert(posts)
    .values({
      id,
      ownerHash: actor.ownerHash,
      title: body.title ?? "",
      status: "draft",
      brand,
      brief: body.brief ?? null,
      assets: body.assets ?? [],
      logoUrl,
      brandKitId,
      promptConfig,
      mediaComposition: body.mediaComposition ?? undefined,
      publishSettings: body.publishSettings ?? undefined,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
};
