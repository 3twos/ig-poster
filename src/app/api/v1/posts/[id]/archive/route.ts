import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toPostResource } from "@/lib/api/v1/posts";
import { resolveActorFromRequest } from "@/services/actors";
import { archivePost } from "@/services/posts";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
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

    return apiOk({ post: toPostResource(row) });
  } catch (error) {
    console.error("[api/v1/posts/id/archive]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to archive post");
  }
}
