import { timingSafeEqual } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { readCookieFromRequest } from "@/lib/cookies";

export const WORKSPACE_SESSION_COOKIE = "workspace_session";
export const WORKSPACE_OAUTH_STATE_COOKIE = "workspace_oauth_state";
export const WORKSPACE_OAUTH_NONCE_COOKIE = "workspace_oauth_nonce";
export const WORKSPACE_OAUTH_NEXT_COOKIE = "workspace_oauth_next";

const WORKSPACE_SESSION_ISSUER = "ig-poster";
const WORKSPACE_SESSION_AUDIENCE = "ig-poster-web";
export const WORKSPACE_SESSION_TTL_SECONDS = 60 * 60 * 12;

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(1),
});

const WorkspaceSessionPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  hd: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
});

export type WorkspaceSession = {
  sub: string;
  email: string;
  domain: string;
  issuedAt: string;
  expiresAt: string;
};

type WorkspaceOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  domain: string;
};

const normalizeDomain = (value: string) => value.trim().toLowerCase();

const getWorkspaceDomain = () => {
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;
  if (!domain) {
    throw new Error("Missing GOOGLE_WORKSPACE_DOMAIN");
  }

  return normalizeDomain(domain);
};

const getOAuthConfig = (origin: string): WorkspaceOAuthConfig => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ?? `${origin}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    domain: getWorkspaceDomain(),
  };
};

const getSessionSecret = () => {
  const secret = process.env.WORKSPACE_AUTH_SECRET || process.env.APP_ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error(
      "Missing WORKSPACE_AUTH_SECRET (or APP_ENCRYPTION_SECRET fallback). " +
        "Set one of these environment variables for session signing.",
    );
  }

  return new TextEncoder().encode(secret);
};

const buildRandomToken = () => crypto.randomUUID().replace(/-/g, "");

const toDateString = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toISOString();

const parseVerifiedGoogleIdentity = (payload: Record<string, unknown>) => {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  const hd = typeof payload.hd === "string" ? normalizeDomain(payload.hd) : "";
  const emailVerifiedRaw = payload.email_verified;
  const emailVerified =
    emailVerifiedRaw === true || emailVerifiedRaw === "true";

  if (!sub || !email) {
    throw new Error("Google OAuth response is missing required identity fields");
  }

  if (!emailVerified) {
    throw new Error("Google account email is not verified");
  }

  const requiredDomain = getWorkspaceDomain();
  if (!hd || hd !== requiredDomain) {
    throw new Error(`Access is restricted to ${requiredDomain}`);
  }

  return { sub, email, domain: hd };
};

export const buildWorkspaceOAuthState = () => buildRandomToken();

export const buildWorkspaceOAuthNonce = () => buildRandomToken();

export const sanitizeNextPath = (value: string | null | undefined) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
};

export const createWorkspaceOAuthStartUrl = (
  origin: string,
  state: string,
  nonce: string,
) => {
  const config = getOAuthConfig(origin);
  const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  oauthUrl.searchParams.set("client_id", config.clientId);
  oauthUrl.searchParams.set("redirect_uri", config.redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("scope", "openid email");
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("nonce", nonce);
  oauthUrl.searchParams.set("hd", config.domain);
  oauthUrl.searchParams.set("prompt", "select_account");

  return oauthUrl;
};

export const completeWorkspaceOAuth = async (
  req: Request,
  code: string,
  expectedNonce: string,
) => {
  const origin = new URL(req.url).origin;
  const config = getOAuthConfig(origin);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const tokenJson = (await tokenResponse.json()) as
    | { error?: string; error_description?: string }
    | Record<string, unknown>;

  if (!tokenResponse.ok) {
    const detail =
      typeof tokenJson.error_description === "string"
        ? tokenJson.error_description
        : typeof tokenJson.error === "string"
          ? tokenJson.error
          : "Google token exchange failed";
    throw new Error(detail);
  }

  const parsedToken = GoogleTokenResponseSchema.parse(tokenJson);
  const verified = await jwtVerify(parsedToken.id_token, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.clientId,
  });

  const nonce = typeof verified.payload.nonce === "string" ? verified.payload.nonce : "";
  const nonceBuf = Buffer.from(nonce);
  const expectedNonceBuf = Buffer.from(expectedNonce);
  if (
    nonceBuf.length !== expectedNonceBuf.length ||
    !timingSafeEqual(nonceBuf, expectedNonceBuf)
  ) {
    throw new Error("Invalid Google OAuth nonce");
  }

  return parseVerifiedGoogleIdentity(verified.payload);
};

export const createWorkspaceSessionToken = async (identity: {
  sub: string;
  email: string;
  domain: string;
}) => {
  return new SignJWT({
    email: identity.email,
    hd: identity.domain,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.sub)
    .setIssuer(WORKSPACE_SESSION_ISSUER)
    .setAudience(WORKSPACE_SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${WORKSPACE_SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
};

export const verifyWorkspaceSessionToken = async (
  token: string,
): Promise<WorkspaceSession | null> => {
  try {
    const verified = await jwtVerify(token, getSessionSecret(), {
      issuer: WORKSPACE_SESSION_ISSUER,
      audience: WORKSPACE_SESSION_AUDIENCE,
    });

    const parsed = WorkspaceSessionPayloadSchema.parse(verified.payload);
    const expectedDomain = getWorkspaceDomain();

    if (normalizeDomain(parsed.hd) !== expectedDomain) {
      console.warn(`[auth:session] domain mismatch: got "${parsed.hd}", expected "${expectedDomain}"`);
      return null;
    }

    return {
      sub: parsed.sub,
      email: parsed.email,
      domain: normalizeDomain(parsed.hd),
      issuedAt: toDateString(parsed.iat),
      expiresAt: toDateString(parsed.exp),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[auth:session] token verification failed: ${message}`, err);
    return null;
  }
};

export const readWorkspaceSessionFromRequest = async (req: Request) => {
  const token = readCookieFromRequest(req, WORKSPACE_SESSION_COOKIE);
  if (!token) {
    console.log("[auth:session] no workspace_session cookie found");
    return null;
  }

  console.log("[auth:session] found workspace_session cookie, verifying…");
  return verifyWorkspaceSessionToken(token);
};
