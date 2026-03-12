import { z } from "zod";

import { apiError, apiOk } from "@/lib/api/v1/envelope";
import {
  PostStatusSchema,
  toPostResource,
  toPostSummaryResource,
} from "@/lib/api/v1/posts";
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
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const url = new URL(req.url);
    const archived = url.searchParams.get("archived");
    const status = url.searchParams.get("status");
    const rows = await listPosts(actor, {
      archived: archived === "true",
      status: status ? PostStatusSchema.parse(status) : undefined,
    });
    const destinationsByPostId = await listStoredPostDestinationsByPostId(
      rows.map((row) => row.id),
    );

    return apiOk({
      posts: rows.map((row) =>
        toPostSummaryResource(row, destinationsByPostId.get(row.id)),
      ),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(400, "INVALID_INPUT", "Invalid query parameters");
    }

    console.error("[api/v1/posts]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to list posts");
  }
}

export async function POST(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const row = await createPost(actor, await req.json());
    const destinations = await getStoredPostDestinations(row.id);
    return apiOk({ post: toPostResource(row, destinations) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid request body");
    }

    console.error("[api/v1/posts]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to create post");
  }
}
