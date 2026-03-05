import { desc, eq, ne, and } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { posts } from "@/db/schema";
import { toSummary } from "@/lib/post";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 18);

export async function GET(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerHash = hashEmail(session.email);
    const url = new URL(req.url);
    const showArchived = url.searchParams.get("archived") === "true";

    const conditions = showArchived
      ? [eq(posts.ownerHash, ownerHash)]
      : [eq(posts.ownerHash, ownerHash), ne(posts.status, "archived")];

    const db = getDb();
    const rows = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.updatedAt))
      .limit(50);

    return NextResponse.json({ posts: rows.map(toSummary) });
  } catch (err) {
    console.error("[api/posts]", err);
    return NextResponse.json(
      { error: "Failed to list posts" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerHash = hashEmail(session.email);
    const body = await req.json().catch(() => ({}));
    const id = randomId();
    const now = new Date();

    const db = getDb();
    const [row] = await db
      .insert(posts)
      .values({
        id,
        ownerHash,
        title: body.title ?? "",
        status: "draft",
        brand: body.brand ?? null,
        brief: body.brief ?? null,
        assets: body.assets ?? [],
        logoUrl: body.logoUrl ?? null,
        promptConfig: body.promptConfig ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ id: row.id, post: row });
  } catch (err) {
    console.error("[api/posts]", err);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 },
    );
  }
}
