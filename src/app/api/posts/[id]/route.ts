import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { PostUpdateRequestSchema } from "@/lib/post-schemas";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const ownerHash = hashEmail(session.email);
    const db = getDb();

    const [row] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    console.error("[api/posts/id]", err);
    return NextResponse.json(
      { error: "Failed to load post" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const ownerHash = hashEmail(session.email);
    const body = PostUpdateRequestSchema.parse(await req.json());
    const db = getDb();

    // Fetch existing row to merge JSONB fields
    const [existing] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build update payload — merge JSONB fields, overwrite scalars
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (body.title !== undefined) update.title = body.title;
    if (body.status !== undefined) update.status = body.status;
    if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl;
    if (body.activeVariantId !== undefined)
      update.activeVariantId = body.activeVariantId;
    if (body.renderedPosterUrl !== undefined)
      update.renderedPosterUrl = body.renderedPosterUrl;
    if (body.shareUrl !== undefined) update.shareUrl = body.shareUrl;
    if (body.shareProjectId !== undefined)
      update.shareProjectId = body.shareProjectId;
    if (body.brandKitId !== undefined)
      update.brandKitId = body.brandKitId;

    // Merge JSONB fields — guard against null incoming values
    if (body.brand !== undefined)
      update.brand = body.brand
        ? { ...(existing.brand ?? {}), ...body.brand }
        : body.brand;
    if (body.brief !== undefined)
      update.brief = body.brief
        ? { ...(existing.brief ?? {}), ...body.brief }
        : body.brief;
    if (body.promptConfig !== undefined)
      update.promptConfig = body.promptConfig
        ? { ...(existing.promptConfig ?? {}), ...body.promptConfig }
        : body.promptConfig;
    if (body.overlayLayouts !== undefined)
      update.overlayLayouts = body.overlayLayouts
        ? { ...(existing.overlayLayouts ?? {}), ...body.overlayLayouts }
        : body.overlayLayouts;

    // Overwrite array fields
    if (body.assets !== undefined) update.assets = body.assets;
    if (body.result !== undefined) update.result = body.result;
    if (body.publishHistory !== undefined)
      update.publishHistory = body.publishHistory;

    // Auto-derive title from brief fields when not explicitly set
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

    // Auto-transition draft → generated when result is set
    if (body.result && existing.status === "draft") {
      update.status = "generated";
    }

    const [updated] = await db
      .update(posts)
      .set(update)
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    console.error("[api/posts/id]", error);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const ownerHash = hashEmail(session.email);
    const db = getDb();

    await db
      .delete(posts)
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/posts/id]", err);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 },
    );
  }
}
