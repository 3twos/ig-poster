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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const rows = await listPosts(actor, {
      archived: url.searchParams.get("archived") === "true",
    });
    const destinationsByPostId = await listStoredPostDestinationsByPostId(
      rows.map((row) => row.id),
    );

    return NextResponse.json({
      posts: rows.map((row) => toSummary(row, destinationsByPostId.get(row.id))),
    });
  } catch (err) {
    console.error("[api/posts]", err);
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = PostCreateRequestSchema.parse(await req.json());
    const row = await createPost(actor, payload);
    const destinations = await getStoredPostDestinations(row.id);

    return NextResponse.json({
      id: row.id,
      post: attachPostDestinations(row, destinations),
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    console.error("[api/posts]", error);
    return NextResponse.json(
      { error: "Failed to create post", detail: buildErrorDetail(error) },
      { status: 500 },
    );
  }
}
