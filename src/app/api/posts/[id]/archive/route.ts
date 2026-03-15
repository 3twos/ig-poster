import { NextResponse } from "next/server";

import { resolveActorFromRequest } from "@/services/actors";
import { archivePost } from "@/services/posts";
import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { buildErrorDetail } from "@/lib/server-utils";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      console.warn("[api/posts/archive] POST: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    console.log(`[api/posts/archive] POST: archiving post ${id} for ${actor.ownerHash}`);
    const updated = await archivePost(actor, id);

    if (!updated) {
      console.warn(`[api/posts/archive] POST: post ${id} not found for ${actor.ownerHash}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log(`[api/posts/archive] POST: archived post ${id} successfully`);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/posts/archive] POST: unhandled error", err);
    return NextResponse.json(
      { error: "Failed to archive post", detail: buildErrorDetail(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      console.warn("[api/posts/archive] DELETE: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    console.log(`[api/posts/archive] DELETE: unarchiving post ${id} for ${actor.ownerHash}`);
    const db = getDb();

    const [updated] = await db
      .update(posts)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, id), eq(posts.ownerHash, actor.ownerHash)))
      .returning();

    if (!updated) {
      console.warn(`[api/posts/archive] DELETE: post ${id} not found for ${actor.ownerHash}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log(`[api/posts/archive] DELETE: unarchived post ${id} successfully`);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/posts/archive] DELETE: unhandled error", err);
    return NextResponse.json(
      { error: "Failed to unarchive post", detail: buildErrorDetail(err) },
      { status: 500 },
    );
  }
}
