import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toPostResource } from "@/lib/api/v1/posts";
import { resolveActorFromRequest } from "@/services/actors";
import { duplicatePost } from "@/services/posts";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/v1/posts/[id]/duplicate">,
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await params;
    const row = await duplicatePost(actor, id);
    if (!row) {
      return apiError(404, "NOT_FOUND", "Post not found");
    }

    return apiOk({ post: toPostResource(row) });
  } catch (error) {
    console.error("[api/v1/posts/id/duplicate]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to duplicate post");
  }
}
