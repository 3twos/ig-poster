import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toPostResource } from "@/lib/api/v1/posts";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { archivePost } from "@/services/posts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const { id } = await params;
    const row = await archivePost(actor, id);
    if (!row) {
      return apiError(404, "NOT_FOUND", "Post not found");
    }

    const destinations = await getStoredPostDestinations(row.id);
    return apiOk({ post: toPostResource(row, destinations) });
  } catch (error) {
    console.error("[api/v1/posts/id/archive]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to archive post");
  }
}
