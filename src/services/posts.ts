import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { brandKits, posts, type PostRow } from "@/db/schema";
import { getPrimaryBrandKitLogoUrl } from "@/lib/brand-kit";
import { deriveTitle, type PostStatus } from "@/lib/post";
import {
  type PostCreateRequest,
  type PostUpdateRequest,
  PostCreateRequestSchema,
  PostUpdateRequestSchema,
} from "@/lib/post-schemas";
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

export const updatePost = async (
  actor: Actor,
  id: string,
  input: PostUpdateRequest,
) => {
  const body = PostUpdateRequestSchema.parse(input);
  const db = getDb();

  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.ownerHash, actor.ownerHash)))
    .limit(1);

  if (!existing) {
    return null;
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) update.title = body.title;
  if (body.status !== undefined) update.status = body.status;
  if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl;
  if (body.activeVariantId !== undefined)
    update.activeVariantId = body.activeVariantId;
  if (body.renderedPosterUrl !== undefined)
    update.renderedPosterUrl = body.renderedPosterUrl;
  if (body.shareUrl !== undefined) update.shareUrl = body.shareUrl;
  if (body.shareProjectId !== undefined) update.shareProjectId = body.shareProjectId;
  if (body.brandKitId !== undefined) update.brandKitId = body.brandKitId;
  if (body.mediaComposition !== undefined && body.mediaComposition !== null) {
    update.mediaComposition = body.mediaComposition;
  }
  if (body.publishSettings !== undefined && body.publishSettings !== null) {
    update.publishSettings = {
      ...(existing.publishSettings ?? {}),
      ...body.publishSettings,
    };
  }

  if (body.brand !== undefined) {
    update.brand = body.brand
      ? { ...(existing.brand ?? {}), ...body.brand }
      : body.brand;
  }
  if (body.brief !== undefined) {
    update.brief = body.brief
      ? { ...(existing.brief ?? {}), ...body.brief }
      : body.brief;
  }
  if (body.promptConfig !== undefined) {
    update.promptConfig = body.promptConfig
      ? { ...(existing.promptConfig ?? {}), ...body.promptConfig }
      : body.promptConfig;
  }
  if (body.overlayLayouts !== undefined) {
    update.overlayLayouts = body.overlayLayouts
      ? { ...(existing.overlayLayouts ?? {}), ...body.overlayLayouts }
      : body.overlayLayouts;
  }

  if (body.assets !== undefined) update.assets = body.assets;
  if (body.result !== undefined) update.result = body.result;
  if (body.publishHistory !== undefined) update.publishHistory = body.publishHistory;

  if (body.title === undefined) {
    const mergedBrief = (update.brief ?? existing.brief) as
      | Record<string, unknown>
      | null;
    if (mergedBrief) {
      const derived =
        (mergedBrief.subject as string) ||
        (mergedBrief.theme as string) ||
        "";
      if (derived && derived !== existing.title) {
        update.title = derived.slice(0, 120);
      }
    }
  }

  if (body.result && existing.status === "draft") {
    update.status = "generated";
  }

  const [updated] = await db
    .update(posts)
    .set(update)
    .where(and(eq(posts.id, id), eq(posts.ownerHash, actor.ownerHash)))
    .returning();

  return updated;
};

const duplicateTitle = (source: Pick<PostRow, "title" | "brief" | "result">) => {
  const base = deriveTitle(source).trim() || "Untitled Post";
  return `${base} Copy`.slice(0, 120);
};

export const duplicatePost = async (actor: Actor, id: string) => {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.ownerHash, actor.ownerHash)))
    .limit(1);

  if (!existing) {
    return null;
  }

  const now = new Date();
  const [duplicated] = await db
    .insert(posts)
    .values({
      id: randomUUID().replace(/-/g, "").slice(0, 18),
      ownerHash: actor.ownerHash,
      title: duplicateTitle(existing),
      status: existing.result ? "generated" : "draft",
      brand: existing.brand ?? null,
      brief: existing.brief ?? null,
      assets: existing.assets ?? [],
      logoUrl: existing.logoUrl,
      brandKitId: existing.brandKitId,
      promptConfig: existing.promptConfig ?? null,
      result: existing.result ?? null,
      activeVariantId: existing.activeVariantId,
      overlayLayouts: existing.overlayLayouts ?? {},
      mediaComposition: existing.mediaComposition,
      publishSettings: existing.publishSettings,
      renderedPosterUrl: null,
      shareUrl: null,
      shareProjectId: null,
      publishHistory: [],
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      publishedAt: null,
    })
    .returning();

  return duplicated;
};

export const archivePost = async (actor: Actor, id: string) => {
  const db = getDb();
  const [updated] = await db
    .update(posts)
    .set({
      status: "archived",
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, id), eq(posts.ownerHash, actor.ownerHash)))
    .returning();

  return updated ?? null;
};
