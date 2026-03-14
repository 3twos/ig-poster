import { hashEmail } from "@/lib/server-utils";
import { WORKSPACE_SCOPES } from "@/lib/auth-scopes";
import {
  readWorkspaceSessionFromRequest,
  verifyWorkspaceSessionToken,
  type WorkspaceSession,
} from "@/lib/workspace-auth";
import { verifyCliAccessToken } from "@/services/auth/cli";

export type ActorAuthSource = "bearer" | "cookie";

export type Actor = {
  type: "workspace-user";
  subjectId: string;
  email: string;
  domain: string;
  ownerHash: string;
  authSource: ActorAuthSource;
  scopes: string[];
  issuedAt: string;
  expiresAt: string;
};

const toActor = (
  session: WorkspaceSession,
  authSource: ActorAuthSource,
): Actor => ({
  type: "workspace-user",
  subjectId: session.sub,
  email: session.email,
  domain: session.domain,
  ownerHash: hashEmail(session.email),
  authSource,
  scopes: [...WORKSPACE_SCOPES],
  issuedAt: session.issuedAt,
  expiresAt: session.expiresAt,
});

const readBearerTokenFromRequest = (req: Request) => {
  const header = req.headers.get("authorization");
  if (!header) {
    return null;
  }

  const [scheme, value] = header.split(/\s+/, 2);
  if (!scheme || !value || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return value.trim() || null;
};

export const resolveActorFromRequest = async (
  req: Request,
): Promise<Actor | null> => {
  const bearerToken = readBearerTokenFromRequest(req);
  if (bearerToken) {
    console.log("[auth:actor] trying bearer token auth");
    const cliActor = await verifyCliAccessToken(bearerToken);
    if (cliActor) {
      console.log(`[auth:actor] CLI access token verified for ${cliActor.email}`);
      return cliActor;
    }

    const session = await verifyWorkspaceSessionToken(bearerToken);
    if (session) {
      console.log(`[auth:actor] bearer session verified for ${session.email} (expires ${session.expiresAt})`);
      return toActor(session, "bearer");
    }

    console.warn("[auth:actor] bearer token present but invalid (CLI + session both failed)");
    return null;
  }

  console.log("[auth:actor] trying cookie auth");
  const session = await readWorkspaceSessionFromRequest(req);
  if (session) {
    console.log(`[auth:actor] cookie session verified for ${session.email} (expires ${session.expiresAt})`);
    return toActor(session, "cookie");
  }

  console.warn("[auth:actor] no valid auth found (no bearer token, no valid cookie)");
  return null;
};

export const actorHasScopes = (actor: Actor, scopes: string[]) =>
  scopes.every((scope) => actor.scopes.includes(scope));

export const requireActorFromRequest = async (
  req: Request,
  scopes: string[] = [],
): Promise<Actor | null> => {
  const actor = await resolveActorFromRequest(req);
  if (!actor) {
    return null;
  }

  return actorHasScopes(actor, scopes) ? actor : null;
};
