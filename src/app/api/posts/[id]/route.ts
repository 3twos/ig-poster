import { NextResponse } from "next/server";
import { z } from "zod";

import { attachPostDestinations } from "@/lib/post-destinations";
import { PostUpdateRequestSchema } from "@/lib/post-schemas";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { resolveMetaAuthForRequest } from "@/services/meta-auth";
import { syncInstagramPublishedPost } from "@/services/instagram-sync";
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
      console.warn("[api/posts/id] GET: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    console.log(`[api/posts/id] GET: loading post ${id} for ${actor.email}`);
    const row = await getPost(actor, id);

    if (!row) {
      console.warn(`[api/posts/id] GET: post ${id} not found for ${actor.ownerHash}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let destinations = await getStoredPostDestinations(row.id);
    if (row.status === "posted") {
      try {
        const resolvedAuth = await resolveMetaAuthForRequest(req, {
          ownerHash: actor.ownerHash,
        });
        await syncInstagramPublishedPost(actor, resolvedAuth, row, destinations);
        destinations = await getStoredPostDestinations(row.id);
      } catch (error) {
        console.warn("[api/posts/id] GET: skipped Instagram sync", error);
      }
    }

    console.log(`[api/posts/id] GET: returning post ${id} (status=${row.status})`);
    return NextResponse.json(attachPostDestinations(row, destinations));
  } catch (err) {
    console.error("[api/posts/id] GET: unhandled error", err);
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
      console.warn("[api/posts/id] PUT: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    console.log(`[api/posts/id] PUT: updating post ${id} for ${actor.email}`);
    const rawBody = await req.json();
    const payload = PostUpdateRequestSchema.parse(rawBody);
    const updated = await updatePost(actor, id, payload);
    if (!updated) {
      console.warn(`[api/posts/id] PUT: post ${id} not found for ${actor.ownerHash}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const destinations = await getStoredPostDestinations(updated.id);
    console.log(`[api/posts/id] PUT: updated post ${id} successfully`);
    return NextResponse.json(attachPostDestinations(updated, destinations));
  } catch (error) {
    if (error instanceof z.ZodError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[api/posts/id] Zod validation failed:", JSON.stringify(error.issues, null, 2));
      }
      return NextResponse.json(
        { error: "Invalid request body", ...(process.env.NODE_ENV !== "production" && { issues: error.issues }) },
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
      console.warn(`[api/posts/id] PUT: service error ${error.status}`, error.message);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[api/posts/id] PUT: unhandled error", error);
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
      console.warn("[api/posts/id] DELETE: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    console.log(`[api/posts/id] DELETE: deleting post ${id} for ${actor.email}`);
    const deleted = await deletePost(actor, id);
    if (!deleted) {
      console.warn(`[api/posts/id] DELETE: post ${id} not found for ${actor.ownerHash}`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log(`[api/posts/id] DELETE: deleted post ${id} successfully`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PostServiceError) {
      console.warn(`[api/posts/id] DELETE: service error ${error.status}`, error.message);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[api/posts/id] DELETE: unhandled error", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 },
    );
  }
}
