import { NextResponse } from "next/server";
import { z } from "zod";

import { attachPostDestinations } from "@/lib/post-destinations";
import { buildErrorDetail } from "@/lib/server-utils";
import { toSummary } from "@/lib/post";
import { PostCreateRequestSchema } from "@/lib/post-schemas";
import { resolveActorFromRequest } from "@/services/actors";
import {
  getStoredPostDestinations,
  listStoredPostDestinationsByPostId,
} from "@/services/post-destinations";
import { createPost, listPosts } from "@/services/posts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      console.warn("[api/posts] GET: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const archived = url.searchParams.get("archived") === "true";
    console.log(`[api/posts] GET: listing posts for ${actor.ownerHash} (archived=${archived})`);
    const rows = await listPosts(actor, { archived });
    const destinationsByPostId = await listStoredPostDestinationsByPostId(
      rows.map((row) => row.id),
    );

    console.log(`[api/posts] GET: returning ${rows.length} posts`);
    return NextResponse.json({
      posts: rows.map((row) => toSummary(row, destinationsByPostId.get(row.id))),
    });
  } catch (err) {
    console.error("[api/posts] GET: unhandled error", err);
    return NextResponse.json(
      { error: "Failed to list posts", detail: buildErrorDetail(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      console.warn("[api/posts] POST: actor resolution failed (401)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[api/posts] POST: creating post for ${actor.ownerHash}`);
    const payload = PostCreateRequestSchema.parse(await req.json());
    const row = await createPost(actor, payload);
    const destinations = await getStoredPostDestinations(row.id);

    console.log(`[api/posts] POST: created post ${row.id}`);
    return NextResponse.json({
      id: row.id,
      post: attachPostDestinations(row, destinations),
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      console.error("[api/posts] POST: validation error", error instanceof z.ZodError ? error.issues : error);
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    console.error("[api/posts] POST: unhandled error", error);
    return NextResponse.json(
      { error: "Failed to create post", detail: buildErrorDetail(error) },
      { status: 500 },
    );
  }
}
