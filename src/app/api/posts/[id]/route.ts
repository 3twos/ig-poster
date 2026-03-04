import { createHash } from "crypto";

import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const hashEmail = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

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
  } catch {
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
    const body = await req.json();
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

    // Merge JSONB fields
    if (body.brand !== undefined)
      update.brand = { ...(existing.brand ?? {}), ...body.brand };
    if (body.brief !== undefined)
      update.brief = { ...(existing.brief ?? {}), ...body.brief };
    if (body.promptConfig !== undefined)
      update.promptConfig = {
        ...(existing.promptConfig ?? {}),
        ...body.promptConfig,
      };
    if (body.overlayLayouts !== undefined)
      update.overlayLayouts = {
        ...(existing.overlayLayouts ?? {}),
        ...body.overlayLayouts,
      };

    // Overwrite array fields
    if (body.assets !== undefined) update.assets = body.assets;
    if (body.result !== undefined) update.result = body.result;
    if (body.publishHistory !== undefined)
      update.publishHistory = body.publishHistory;

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
  } catch {
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
  } catch {
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 },
    );
  }
}
