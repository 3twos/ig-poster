import { and, asc, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { brandKits, posts } from "@/db/schema";
import { getPrimaryBrandKitLogoUrl } from "@/lib/brand-kit";
import { toSummary } from "@/lib/post";
import { PostCreateRequestSchema } from "@/lib/post-schemas";
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
    const body = PostCreateRequestSchema.parse(await req.json());
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
        .where(eq(brandKits.ownerHash, ownerHash))
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
        ownerHash,
        title: body.title ?? "",
        status: "draft",
        brand,
        brief: body.brief ?? null,
        assets: body.assets ?? [],
        logoUrl,
        brandKitId,
        promptConfig,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ id: row.id, post: row });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    console.error("[api/posts]", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 },
    );
  }
}
