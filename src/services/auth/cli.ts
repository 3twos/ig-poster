import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { WORKSPACE_SCOPES } from "@/lib/auth-scopes";
import { requireAppEncryptionSecret } from "@/lib/app-encryption";
import {
  isCredentialStoreEnabled,
  listCredentialRecords,
  putCredentialRecord,
  readCredentialRecord,
} from "@/lib/private-credential-store";
import { hashEmail } from "@/lib/server-utils";
import type { Actor } from "@/services/actors";

export const CLI_ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
export const CLI_AUTH_CODE_TTL_SECONDS = 60 * 5;
export const CLI_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

const CLI_TOKEN_ISSUER = "ig-poster";
const CLI_ACCESS_TOKEN_AUDIENCE = "ig-poster-cli";
const CLI_AUTH_CODE_AUDIENCE = "ig-poster-cli-auth-code";
const DEFAULT_CLI_SESSION_LABEL = "IG CLI";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const CliAuthCodePayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  hd: z.string().min(1),
  scp: z.array(z.string()).default([...WORKSPACE_SCOPES]),
  challenge: z.string().min(43).max(128),
  redirectUri: z.string().url(),
  iat: z.number(),
  exp: z.number(),
});

const CliAccessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  hd: z.string().min(1),
  scp: z.array(z.string()).default([...WORKSPACE_SCOPES]),
  sid: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
});

const CliSessionRecordSchema = z.object({
  id: z.string().min(1),
  ownerHash: z.string().min(1),
  subjectId: z.string().min(1),
  email: z.string().email(),
  domain: z.string().min(1),
  label: z.string().min(1).max(80),
  scopes: z.array(z.string()).min(1),
  secretHash: z.string().length(64),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  userAgent: z.string().max(500).nullable(),
});

export type CliSessionRecord = z.infer<typeof CliSessionRecordSchema>;

export type CliSessionView = Omit<CliSessionRecord, "ownerHash" | "subjectId" | "secretHash">;

export class CliAuthServiceError extends Error {
  readonly status: 400 | 401 | 404 | 503;

  constructor(status: 400 | 401 | 404 | 503, message: string) {
    super(message);
    this.name = "CliAuthServiceError";
    this.status = status;
  }
}

type CliIdentity = Pick<Actor, "subjectId" | "email" | "domain" | "ownerHash">;

const toDateString = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toISOString();

const getSigningKey = () =>
  new TextEncoder().encode(
    requireAppEncryptionSecret("signing CLI auth and refresh tokens"),
  );

const normalizeSessionLabel = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) {
    return DEFAULT_CLI_SESSION_LABEL;
  }

  return normalized.slice(0, 80);
};

const normalizeUserAgent = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 500);
};

const sha256Hex = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const pkceChallengeForVerifier = (value: string) =>
  createHash("sha256").update(value).digest("base64url");

const isLoopbackRedirectUri = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname);
  } catch {
    return false;
  }
};

const parseCliRefreshToken = (value: string) => {
  const [sessionId, secret] = value.split(".", 2);
  if (!sessionId || !secret) {
    throw new CliAuthServiceError(401, "Invalid refresh token.");
  }

  return { sessionId, secret };
};

const ensureCliSessionStore = () => {
  if (!isCredentialStoreEnabled()) {
    throw new CliAuthServiceError(
      503,
      "CLI auth requires POSTGRES_URL or DATABASE_URL for session storage.",
    );
  }
};

const issueAccessToken = async (
  identity: CliIdentity,
  sessionId: string,
  scopes: readonly string[],
) =>
  new SignJWT({
    email: identity.email,
    hd: identity.domain,
    scp: [...scopes],
    sid: sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.subjectId)
    .setIssuer(CLI_TOKEN_ISSUER)
    .setAudience(CLI_ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CLI_ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(getSigningKey());

const buildRefreshToken = (sessionId: string) => {
  const secret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return {
    refreshToken: `${sessionId}.${secret}`,
    secretHash: sha256Hex(secret),
  };
};

const toSessionView = (record: CliSessionRecord): CliSessionView => ({
  id: record.id,
  email: record.email,
  domain: record.domain,
  label: record.label,
  scopes: record.scopes,
  createdAt: record.createdAt,
  lastUsedAt: record.lastUsedAt,
  expiresAt: record.expiresAt,
  revokedAt: record.revokedAt,
  userAgent: record.userAgent,
});

const readSessionRecord = async (sessionId: string) => {
  const record = await readCredentialRecord<CliSessionRecord>(
    "cli_session",
    sessionId,
  );
  return record ? CliSessionRecordSchema.parse(record) : null;
};

const writeSessionRecord = async (record: CliSessionRecord) => {
  await putCredentialRecord("cli_session", record.id, record);
};

const assertActiveSession = (record: CliSessionRecord, secret: string) => {
  const now = Date.now();
  if (record.revokedAt) {
    throw new CliAuthServiceError(401, "CLI session has been revoked.");
  }

  if (Date.parse(record.expiresAt) <= now) {
    throw new CliAuthServiceError(401, "CLI session has expired.");
  }

  const secretHash = sha256Hex(secret);
  const expected = Buffer.from(record.secretHash, "hex");
  const actual = Buffer.from(secretHash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new CliAuthServiceError(401, "Invalid refresh token.");
  }
};

export const ensureCliAuthReady = () => {
  ensureCliSessionStore();
};

export const createCliAuthorizationCode = async (params: {
  actor: Actor;
  codeChallenge: string;
  redirectUri: string;
}) => {
  if (!isLoopbackRedirectUri(params.redirectUri)) {
    throw new CliAuthServiceError(
      400,
      "CLI redirect URI must use http://localhost or http://127.0.0.1.",
    );
  }

  return new SignJWT({
    email: params.actor.email,
    hd: params.actor.domain,
    scp: [...params.actor.scopes],
    challenge: params.codeChallenge,
    redirectUri: params.redirectUri,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.actor.subjectId)
    .setIssuer(CLI_TOKEN_ISSUER)
    .setAudience(CLI_AUTH_CODE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CLI_AUTH_CODE_TTL_SECONDS}s`)
    .sign(getSigningKey());
};

export const exchangeCliAuthorizationCode = async (params: {
  code: string;
  codeVerifier: string;
  label?: string | null;
  userAgent?: string | null;
}) => {
  ensureCliSessionStore();

  let payload: z.infer<typeof CliAuthCodePayloadSchema>;
  try {
    const verified = await jwtVerify(params.code, getSigningKey(), {
      issuer: CLI_TOKEN_ISSUER,
      audience: CLI_AUTH_CODE_AUDIENCE,
    });
    payload = CliAuthCodePayloadSchema.parse(verified.payload);
  } catch {
    throw new CliAuthServiceError(401, "Invalid or expired CLI authorization code.");
  }

  if (pkceChallengeForVerifier(params.codeVerifier) !== payload.challenge) {
    throw new CliAuthServiceError(401, "Invalid PKCE code verifier.");
  }

  const now = new Date();
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 20);
  const refresh = buildRefreshToken(sessionId);
  const refreshExpiresAt = new Date(
    now.getTime() + CLI_REFRESH_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();
  const accessToken = await issueAccessToken(
    {
      subjectId: payload.sub,
      email: payload.email,
      domain: payload.hd,
      ownerHash: hashEmail(payload.email),
    },
    sessionId,
    payload.scp,
  );
  const accessTokenExpiresAt = new Date(
    now.getTime() + CLI_ACCESS_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();

  const record: CliSessionRecord = {
    id: sessionId,
    ownerHash: hashEmail(payload.email),
    subjectId: payload.sub,
    email: payload.email,
    domain: payload.hd,
    label: normalizeSessionLabel(params.label),
    scopes: payload.scp,
    secretHash: refresh.secretHash,
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    expiresAt: refreshExpiresAt,
    revokedAt: null,
    userAgent: normalizeUserAgent(params.userAgent),
  };

  await writeSessionRecord(record);

  return {
    accessToken,
    accessTokenExpiresAt,
    refreshToken: refresh.refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt,
    session: toSessionView(record),
  };
};

export const refreshCliSession = async (
  refreshToken: string,
  userAgent?: string | null,
) => {
  ensureCliSessionStore();
  const { sessionId, secret } = parseCliRefreshToken(refreshToken);
  const record = await readSessionRecord(sessionId);
  if (!record) {
    throw new CliAuthServiceError(401, "Invalid refresh token.");
  }

  assertActiveSession(record, secret);

  const now = new Date();
  const rotated = buildRefreshToken(record.id);
  const expiresAt = new Date(
    now.getTime() + CLI_REFRESH_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();

  const nextRecord: CliSessionRecord = {
    ...record,
    secretHash: rotated.secretHash,
    lastUsedAt: now.toISOString(),
    expiresAt,
    userAgent: normalizeUserAgent(userAgent) ?? record.userAgent,
  };

  await writeSessionRecord(nextRecord);

  return {
    accessToken: await issueAccessToken(
      {
        subjectId: nextRecord.subjectId,
        email: nextRecord.email,
        domain: nextRecord.domain,
        ownerHash: nextRecord.ownerHash,
      },
      nextRecord.id,
      nextRecord.scopes,
    ),
    accessTokenExpiresAt: new Date(
      now.getTime() + CLI_ACCESS_TOKEN_TTL_SECONDS * 1000,
    ).toISOString(),
    refreshToken: rotated.refreshToken,
    refreshTokenExpiresAt: expiresAt,
    session: toSessionView(nextRecord),
  };
};

export const revokeCliSessionByRefreshToken = async (refreshToken: string) => {
  ensureCliSessionStore();

  try {
    const { sessionId, secret } = parseCliRefreshToken(refreshToken);
    const record = await readSessionRecord(sessionId);
    if (!record) {
      return false;
    }

    assertActiveSession(record, secret);
    await writeSessionRecord({
      ...record,
      revokedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    if (error instanceof CliAuthServiceError && error.status === 401) {
      return false;
    }

    throw error;
  }
};

export const listCliSessions = async (actor: Actor) => {
  ensureCliSessionStore();

  const sessions = await listCredentialRecords<CliSessionRecord>("cli_session");
  return sessions
    .flatMap((item) => {
      const parsed = CliSessionRecordSchema.safeParse(item.payload);
      if (!parsed.success) {
        console.warn(
          `[services/auth/cli] Ignoring invalid cli_session record ${item.credentialId}`,
        );
        return [];
      }

      return [parsed.data];
    })
    .filter((record) => record.ownerHash === actor.ownerHash)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(toSessionView);
};

export const revokeCliSessionById = async (actor: Actor, sessionId: string) => {
  ensureCliSessionStore();

  const record = await readSessionRecord(sessionId);
  if (!record || record.ownerHash !== actor.ownerHash) {
    throw new CliAuthServiceError(404, "CLI session not found.");
  }

  const revokedAt = new Date().toISOString();
  const nextRecord: CliSessionRecord = {
    ...record,
    revokedAt,
  };

  await writeSessionRecord(nextRecord);

  return toSessionView(nextRecord);
};

export const verifyCliAccessToken = async (token: string) => {
  try {
    const verified = await jwtVerify(token, getSigningKey(), {
      issuer: CLI_TOKEN_ISSUER,
      audience: CLI_ACCESS_TOKEN_AUDIENCE,
    });
    const payload = CliAccessTokenPayloadSchema.parse(verified.payload);

    return {
      type: "workspace-user" as const,
      subjectId: payload.sub,
      email: payload.email,
      domain: payload.hd,
      ownerHash: hashEmail(payload.email),
      authSource: "bearer" as const,
      scopes: payload.scp,
      issuedAt: toDateString(payload.iat),
      expiresAt: toDateString(payload.exp),
    };
  } catch {
    return null;
  }
};
