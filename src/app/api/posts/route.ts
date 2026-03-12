import { NextResponse } from "next/server";
import { z } from "zod";

import { toSummary } from "@/lib/post";
import { PostCreateRequestSchema } from "@/lib/post-schemas";
import { resolveActorFromRequest } from "@/services/actors";
import { createPost, listPosts } from "@/services/posts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const rows = await listPosts(actor, {
      archived: url.searchParams.get("archived") === "true",
    });

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
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = PostCreateRequestSchema.parse(await req.json());
    const row = await createPost(actor, payload);

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
