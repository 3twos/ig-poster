import { z } from "zod";

import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toPostResource } from "@/lib/api/v1/posts";
import { resolveActorFromRequest } from "@/services/actors";
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

    return apiOk({ post: toPostResource(row) });
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

    return apiOk({ post: toPostResource(row) });
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
