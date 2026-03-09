import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const ownerHash = hashEmail(session.email);
    const db = getDb();

    const [updated] = await db
      .update(posts)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/posts/archive]", err);
    return NextResponse.json(
      { error: "Failed to archive post" },
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

    const [updated] = await db
      .update(posts)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/posts/archive]", err);
    return NextResponse.json(
      { error: "Failed to unarchive post" },
      { status: 500 },
    );
  }
}
