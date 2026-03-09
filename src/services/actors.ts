import { hashEmail } from "@/lib/server-utils";
import {
  readWorkspaceSessionFromRequest,
  verifyWorkspaceSessionToken,
  type WorkspaceSession,
} from "@/lib/workspace-auth";

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

const WORKSPACE_SCOPES = ["posts:read", "posts:write"];

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
  scopes: WORKSPACE_SCOPES,
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
    const session = await verifyWorkspaceSessionToken(bearerToken);
    return session ? toActor(session, "bearer") : null;
  }

  const session = await readWorkspaceSessionFromRequest(req);
  return session ? toActor(session, "cookie") : null;
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
