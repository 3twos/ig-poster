import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { posts, type PostRow } from "@/db/schema";
import { deriveTitle } from "@/lib/post";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 18);

const duplicateTitle = (source: Pick<PostRow, "title" | "brief" | "result">) => {
  const base = deriveTitle(source).trim() || "Untitled Post";
  return `${base} Copy`.slice(0, 120);
};

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const ownerHash = hashEmail(session.email);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.id, id), eq(posts.ownerHash, ownerHash)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date();
    const [duplicated] = await db
      .insert(posts)
      .values({
        id: randomId(),
        ownerHash,
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
        mediaComposition: existing.mediaComposition ?? undefined,
        publishSettings: existing.publishSettings ?? undefined,
        renderedPosterUrl: existing.renderedPosterUrl,
        shareUrl: null,
        shareProjectId: null,
        publishHistory: [],
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        publishedAt: null,
      })
      .returning();

    return NextResponse.json({ id: duplicated.id, post: duplicated });
  } catch (error) {
    console.error("[api/posts/id/duplicate]", error);
    return NextResponse.json(
      { error: "Failed to duplicate post" },
      { status: 500 },
    );
  }
}
