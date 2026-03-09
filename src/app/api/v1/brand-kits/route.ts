import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { toBrandKitResource } from "@/lib/api/v1/brand-kits";
import { resolveActorFromRequest } from "@/services/actors";
import { listBrandKits } from "@/services/brand-kits";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return apiError(401, "AUTH_REQUIRED", "Login required");
    }

    const rows = await listBrandKits(actor);
    return apiOk({
      brandKits: rows.map(toBrandKitResource),
    });
  } catch (error) {
    console.error("[api/v1/brand-kits]", error);
    return apiError(500, "INTERNAL_ERROR", "Failed to list brand kits");
  }
}
