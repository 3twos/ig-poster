import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { WORKSPACE_SCOPES } from "@/lib/auth-scopes";
import { requireAppEncryptionSecret } from "@/lib/app-encryption";
import {
  deleteCredentialRecord,
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
export const CLI_DEVICE_CODE_TTL_SECONDS = 60 * 10;
export const CLI_DEVICE_CODE_POLL_INTERVAL_SECONDS = 5;

const CLI_TOKEN_ISSUER = "ig-poster";
const CLI_ACCESS_TOKEN_AUDIENCE = "ig-poster-cli";
const CLI_AUTH_CODE_AUDIENCE = "ig-poster-cli-auth-code";
const DEFAULT_CLI_SESSION_LABEL = "IG CLI";
const DEVICE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_CODE_USER_CODE_LENGTH = 8;

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

const CliDeviceCodeRecordSchema = z.object({
  id: z.string().min(1),
  userCode: z.string().regex(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  ownerHash: z.string().min(1).nullable(),
  subjectId: z.string().min(1).nullable(),
  email: z.string().email().nullable(),
  domain: z.string().min(1).nullable(),
  scopes: z.array(z.string()),
  label: z.string().min(1).max(80),
  userAgent: z.string().max(500).nullable(),
});

export type CliSessionRecord = z.infer<typeof CliSessionRecordSchema>;
export type CliDeviceCodeRecord = z.infer<typeof CliDeviceCodeRecordSchema>;

export type CliSessionView = Omit<CliSessionRecord, "ownerHash" | "subjectId" | "secretHash">;

export type CliAuthTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  session: CliSessionView;
};

export type CliDeviceCodeStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: string;
  intervalSeconds: number;
};

export type CliDeviceCodePollResult =
  | {
      status: "pending";
      expiresAt: string;
      intervalSeconds: number;
    }
  | ({
      status: "approved";
    } & CliAuthTokens)
  | {
      status: "expired";
      expiresAt: string;
      intervalSeconds: number;
    };

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

const buildDeviceCode = () =>
  randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

const buildDeviceUserCode = () => {
  const bytes = randomBytes(DEVICE_CODE_USER_CODE_LENGTH);
  let code = "";

  for (let index = 0; index < DEVICE_CODE_USER_CODE_LENGTH; index += 1) {
    code += DEVICE_CODE_ALPHABET[bytes[index]! % DEVICE_CODE_ALPHABET.length];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

const normalizeDeviceUserCode = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== DEVICE_CODE_USER_CODE_LENGTH) {
    throw new CliAuthServiceError(400, "Invalid CLI device code.");
  }

  if (/[^A-HJ-NP-Z2-9]/u.test(normalized)) {
    throw new CliAuthServiceError(400, "Invalid CLI device code.");
  }

  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
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

const readDeviceCodeRecord = async (deviceCode: string) => {
  const record = await readCredentialRecord<CliDeviceCodeRecord>(
    "cli_device_code",
    deviceCode,
  );
  return record ? CliDeviceCodeRecordSchema.parse(record) : null;
};

const writeDeviceCodeRecord = async (record: CliDeviceCodeRecord) => {
  await putCredentialRecord("cli_device_code", record.id, record);
};

const deleteDeviceCodeRecord = async (deviceCode: string) => {
  await deleteCredentialRecord("cli_device_code", deviceCode);
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

const issueCliSessionTokens = async (params: {
  identity: CliIdentity;
  scopes: readonly string[];
  label?: string | null;
  userAgent?: string | null;
}): Promise<CliAuthTokens> => {
  const now = new Date();
  const sessionId = randomUUID().replace(/-/g, "").slice(0, 20);
  const refresh = buildRefreshToken(sessionId);
  const refreshExpiresAt = new Date(
    now.getTime() + CLI_REFRESH_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();
  const accessToken = await issueAccessToken(
    params.identity,
    sessionId,
    params.scopes,
  );
  const accessTokenExpiresAt = new Date(
    now.getTime() + CLI_ACCESS_TOKEN_TTL_SECONDS * 1000,
  ).toISOString();

  const record: CliSessionRecord = {
    id: sessionId,
    ownerHash: params.identity.ownerHash,
    subjectId: params.identity.subjectId,
    email: params.identity.email,
    domain: params.identity.domain,
    label: normalizeSessionLabel(params.label),
    scopes: [...params.scopes],
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

  return issueCliSessionTokens({
    identity: {
      subjectId: payload.sub,
      email: payload.email,
      domain: payload.hd,
      ownerHash: hashEmail(payload.email),
    },
    scopes: payload.scp,
    label: params.label,
    userAgent: params.userAgent,
  });
};

export const createCliDeviceCode = async (params: {
  origin: string;
  label?: string | null;
  userAgent?: string | null;
}): Promise<CliDeviceCodeStart> => {
  ensureCliSessionStore();

  const deviceCode = buildDeviceCode();
  const userCode = buildDeviceUserCode();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + CLI_DEVICE_CODE_TTL_SECONDS * 1000,
  ).toISOString();
  const verificationUri = new URL("/cli/device", params.origin);
  const verificationUriComplete = new URL("/cli/device", params.origin);
  verificationUriComplete.searchParams.set("user_code", userCode);

  await writeDeviceCodeRecord({
    id: deviceCode,
    userCode,
    createdAt: now.toISOString(),
    expiresAt,
    approvedAt: null,
    ownerHash: null,
    subjectId: null,
    email: null,
    domain: null,
    scopes: [],
    label: normalizeSessionLabel(params.label),
    userAgent: normalizeUserAgent(params.userAgent),
  });

  return {
    deviceCode,
    userCode,
    verificationUri: verificationUri.toString(),
    verificationUriComplete: verificationUriComplete.toString(),
    expiresAt,
    intervalSeconds: CLI_DEVICE_CODE_POLL_INTERVAL_SECONDS,
  };
};

export const approveCliDeviceCode = async (params: {
  actor: Actor;
  userCode: string;
}) => {
  ensureCliSessionStore();

  const normalizedUserCode = normalizeDeviceUserCode(params.userCode);
  const records = await listCredentialRecords<CliDeviceCodeRecord>("cli_device_code");
  const now = Date.now();
  let matchedRecord: CliDeviceCodeRecord | null = null;

  for (const item of records) {
    const parsed = CliDeviceCodeRecordSchema.safeParse(item.payload);
    if (!parsed.success) {
      console.warn(
        `[services/auth/cli] Ignoring invalid cli_device_code record ${item.credentialId}`,
      );
      continue;
    }

    const record = parsed.data;
    if (record.userCode !== normalizedUserCode) {
      continue;
    }

    if (Date.parse(record.expiresAt) <= now) {
      await deleteDeviceCodeRecord(record.id);
      continue;
    }

    matchedRecord = record;
    break;
  }

  if (!matchedRecord) {
    throw new CliAuthServiceError(404, "CLI device code not found or expired.");
  }

  if (!matchedRecord.approvedAt) {
    matchedRecord = {
      ...matchedRecord,
      approvedAt: new Date().toISOString(),
      ownerHash: params.actor.ownerHash,
      subjectId: params.actor.subjectId,
      email: params.actor.email,
      domain: params.actor.domain,
      scopes: [...params.actor.scopes],
    };
    await writeDeviceCodeRecord(matchedRecord);
  }

  return {
    userCode: matchedRecord.userCode,
    email: matchedRecord.email ?? params.actor.email,
    expiresAt: matchedRecord.expiresAt,
    approvedAt: matchedRecord.approvedAt,
  };
};

export const pollCliDeviceCode = async (
  deviceCode: string,
  userAgent?: string | null,
): Promise<CliDeviceCodePollResult> => {
  ensureCliSessionStore();

  let record: CliDeviceCodeRecord;
  try {
    const loaded = await readDeviceCodeRecord(deviceCode);
    if (!loaded) {
      throw new CliAuthServiceError(401, "Invalid or expired CLI device code.");
    }
    record = loaded;
  } catch (error) {
    if (error instanceof CliAuthServiceError) {
      throw error;
    }

    await deleteDeviceCodeRecord(deviceCode);
    throw new CliAuthServiceError(401, "Invalid or expired CLI device code.");
  }

  if (Date.parse(record.expiresAt) <= Date.now()) {
    await deleteDeviceCodeRecord(record.id);
    return {
      status: "expired",
      expiresAt: record.expiresAt,
      intervalSeconds: CLI_DEVICE_CODE_POLL_INTERVAL_SECONDS,
    };
  }

  if (
    !record.approvedAt ||
    !record.ownerHash ||
    !record.subjectId ||
    !record.email ||
    !record.domain
  ) {
    return {
      status: "pending",
      expiresAt: record.expiresAt,
      intervalSeconds: CLI_DEVICE_CODE_POLL_INTERVAL_SECONDS,
    };
  }

  const tokens = await issueCliSessionTokens({
    identity: {
      subjectId: record.subjectId,
      email: record.email,
      domain: record.domain,
      ownerHash: record.ownerHash,
    },
    scopes: record.scopes.length > 0 ? record.scopes : WORKSPACE_SCOPES,
    label: record.label,
    userAgent: normalizeUserAgent(userAgent) ?? record.userAgent,
  });
  await deleteDeviceCodeRecord(record.id);

  return {
    status: "approved",
    ...tokens,
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
