import { z } from "zod";

import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toPostResource } from "@/lib/api/v1/posts";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { resolveMetaAuthForApi } from "@/services/meta-auth";
import { syncInstagramPublishedPost } from "@/services/instagram-sync";
import { getPost, updatePost } from "@/services/posts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await params;
    const row = await getPost(actor, id);

    if (!row) {
      return apiError(404, "NOT_FOUND", "Post not found");
    }

    let destinations = await getStoredPostDestinations(row.id);
    if (row.status === "posted") {
      try {
        const resolvedAuth = await resolveMetaAuthForApi({
          ownerHash: actor.ownerHash,
        });
        await syncInstagramPublishedPost(actor, resolvedAuth, row, destinations);
        destinations = await getStoredPostDestinations(row.id);
      } catch (error) {
        console.warn("[api/v1/posts/id] skipped Instagram sync", error);
      }
    }

    return apiOk({ post: toPostResource(row, destinations) });
  } catch (error) {
    console.error("[api/v1/posts/id]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to load post");
  }
}

export async function PATCH(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await params;
    const row = await updatePost(actor, id, await req.json());

    if (!row) {
      return apiError(404, "NOT_FOUND", "Post not found");
    }

    const destinations = await getStoredPostDestinations(row.id);
    return apiOk({ post: toPostResource(row, destinations) });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return apiError(400, "INVALID_INPUT", "Invalid request body");
    }
    if (error instanceof Error && "status" in error && error.status === 409) {
      return apiError(409, "CONFLICT", error.message);
    }

    console.error("[api/v1/posts/id]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to update post");
  }
}
