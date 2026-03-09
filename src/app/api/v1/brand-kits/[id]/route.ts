import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toBrandKitResource } from "@/lib/api/v1/brand-kits";
import { resolveActorFromRequest } from "@/services/actors";
import { getBrandKit } from "@/services/brand-kits";

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
    const row = await getBrandKit(actor, id);
    if (!row) {
      return apiError(404, "NOT_FOUND", "Brand kit not found");
    }

    return apiOk({
      brandKit: toBrandKitResource(row),
    });
  } catch (error) {
    console.error("[api/v1/brand-kits/id]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to load brand kit");
  }
}
