import { NextResponse } from "next/server";
import { z } from "zod";

import { attachPostDestinations } from "@/lib/post-destinations";
import { PostUpdateRequestSchema } from "@/lib/post-schemas";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import {
  deletePost,
  getPost,
  PostServiceError,
  updatePost,
} from "@/services/posts";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const row = await getPost(actor, id);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const destinations = await getStoredPostDestinations(row.id);
    return NextResponse.json(attachPostDestinations(row, destinations));
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
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const payload = PostUpdateRequestSchema.parse(await req.json());
    const updated = await updatePost(actor, id, payload);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const destinations = await getStoredPostDestinations(updated.id);
    return NextResponse.json(attachPostDestinations(updated, destinations));
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[api/posts/id] Zod validation failed:", JSON.stringify(error.issues, null, 2));
      return NextResponse.json(
        { error: "Invalid request body", issues: error.issues },
        { status: 400 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    if (error instanceof PostServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
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
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const deleted = await deletePost(actor, id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PostServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[api/posts/id]", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 },
    );
  }
}
