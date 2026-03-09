import { apiError, apiOk } from "@/lib/api/v1/envelope";
import { resolveActorFromRequest } from "@/services/actors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActorFromRequest(req);
  if (!actor) {
    return apiError(401, "AUTH_REQUIRED", "Login required");
  }

  return apiOk({
    actor: {
      type: actor.type,
      subjectId: actor.subjectId,
      email: actor.email,
      domain: actor.domain,
      authSource: actor.authSource,
      scopes: actor.scopes,
      issuedAt: actor.issuedAt,
      expiresAt: actor.expiresAt,
    },
  });
}
