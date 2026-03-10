import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { resolveActorFromRequest } from "@/services/actors";
import { getApiStatus } from "@/services/status";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActorFromRequest(req);
  if (!actor) {
    return apiError(401, "AUTH_REQUIRED", "Login required");
  }

  return apiOk(await getApiStatus(actor));
}
