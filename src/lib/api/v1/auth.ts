import { z } from "zod";

export const AuthActorSchema = z.object({
  type: z.literal("workspace-user"),
  subjectId: z.string().min(1),
  email: z.string().email(),
  domain: z.string().min(1),
  authSource: z.enum(["bearer", "cookie"]),
  scopes: z.array(z.string()),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const WhoAmIDataSchema = z.object({
  actor: AuthActorSchema,
});

export const CliSessionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  email: z.string().email(),
  domain: z.string().min(1),
  scopes: z.array(z.string()),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  userAgent: z.string().nullable(),
});

export const CliAuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.string().datetime(),
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: z.string().datetime(),
  session: CliSessionSchema,
});

export const CliAuthExchangeRequestSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  label: z.string().trim().min(1).max(80).optional(),
});

export const CliAuthRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
