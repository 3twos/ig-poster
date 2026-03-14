import { randomUUID } from "node:crypto";

import { z } from "zod";

import { ClientSafeError } from "@/lib/api-error";
import {
  getAppEncryptionSecret,
  requireAppEncryptionSecret,
} from "@/lib/app-encryption";
import { readCookieFromRequest } from "@/lib/cookies";
import {
  buildMetaAccountKey,
  buildMetaDestinationCapabilities,
  type MetaDestinationCapabilities,
} from "@/lib/meta-accounts";
import { getEnvMetaAuth, type MetaAuthContext } from "@/lib/meta";
import {
  deleteCredentialRecord,
  type CredentialNamespace,
  isCredentialStoreEnabled,
  putCredentialRecord,
  readCredentialRecord,
} from "@/lib/private-credential-store";
import { decryptString, encryptString } from "@/lib/secure";

export const META_OAUTH_STATE_COOKIE = "meta_oauth_state";
export const META_CONNECTION_COOKIE = "ig_connection";
const INLINE_CONNECTION_PREFIX = "inline:";
const META_CONNECTION_NAMESPACE: CredentialNamespace = "meta";
const META_PAGE_PUBLISH_PERMISSION = "pages_manage_posts";

const META_OAUTH_BASE_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
] as const;

const META_OAUTH_PAGE_PUBLISH_SCOPES = [
  "pages_manage_posts",
  "pages_manage_metadata",
] as const;

const graphVersion = process.env.META_GRAPH_VERSION ?? "v22.0";

export type MetaOAuthScopeProfile = "instagram-basic" | "page-publishing";

const OAuthTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
});

const PagesResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().default(""),
      access_token: z.string().optional().default(""),
      instagram_business_account: z
        .object({
          id: z.string(),
          username: z.string().optional().default(""),
          name: z.string().optional().default(""),
          profile_picture_url: z.string().optional().default(""),
        })
        .optional(),
    }),
  ),
});

type MetaOAuthPage = z.infer<typeof PagesResponseSchema>["data"][number];
type EligibleMetaOAuthPage = MetaOAuthPage & {
  access_token: string;
  instagram_business_account: NonNullable<MetaOAuthPage["instagram_business_account"]>;
};

export const MetaOAuthConnectionSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  graphVersion: z.string(),
  pageId: z.string(),
  pageName: z.string().default(""),
  instagramUserId: z.string(),
  instagramUsername: z.string().default(""),
  instagramName: z.string().default(""),
  instagramPictureUrl: z.string().default(""),
  tokenExpiresAt: z.string().datetime().optional(),
  grantedScopes: z.array(z.string().trim().min(1)).optional(),
  encryptedAccessToken: z.string().min(12),
});

export type MetaOAuthConnection = z.infer<typeof MetaOAuthConnectionSchema>;

const InlineMetaOAuthConnectionSchema = z.object({
  graphVersion: z.string().min(1),
  pageId: z.string().min(1).optional(),
  instagramUserId: z.string().min(1),
  instagramUsername: z.string().optional().default(""),
  instagramName: z.string().optional().default(""),
  pageName: z.string().optional().default(""),
  tokenExpiresAt: z.string().datetime().optional(),
  grantedScopes: z.array(z.string().trim().min(1)).optional(),
  accessToken: z.string().trim().min(8).max(4000),
});

type InlineMetaOAuthConnection = z.infer<typeof InlineMetaOAuthConnectionSchema>;

type ResolvedMetaAccount = {
  connectionId?: string;
  accountKey?: string;
  pageId?: string;
  pageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  instagramName?: string;
  tokenExpiresAt?: string;
  capabilities?: MetaDestinationCapabilities;
};

export type ResolvedMetaAuth = {
  source: "oauth" | "env";
  auth: MetaAuthContext;
  account: ResolvedMetaAccount;
};

const getMetaOAuthConfig = (origin: string) => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri =
    process.env.META_REDIRECT_URI ?? `${origin}/api/auth/meta/callback`;

  if (!appId || !appSecret) {
    return null;
  }

  return {
    appId,
    appSecret,
    redirectUri,
    graphVersion,
  };
};

export const getEncryptionSecret = () => getAppEncryptionSecret();

const callGraphJson = async <T>(url: URL): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  let json: { error?: { message?: string } } & T;
  try {
    json = (await response.json()) as { error?: { message?: string } } & T;
  } catch {
    throw new Error(`Meta API returned non-JSON response (${response.status})`);
  }

  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? "Meta API request failed");
  }

  return json;
};

const parseConnectionCookie = (cookieValue: string) => {
  const value = cookieValue.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith(INLINE_CONNECTION_PREFIX)) {
    const encryptedPayload = value.slice(INLINE_CONNECTION_PREFIX.length).trim();
    if (!encryptedPayload) {
      return null;
    }

    return { kind: "inline" as const, encryptedPayload };
  }

  return { kind: "stored" as const, id: value };
};

const decodeInlineConnection = (
  encryptedPayload: string,
): InlineMetaOAuthConnection => {
  const secret = requireAppEncryptionSecret();
  const decrypted = decryptString(encryptedPayload, secret);
  const parsed = InlineMetaOAuthConnectionSchema.safeParse(JSON.parse(decrypted));

  if (!parsed.success) {
    throw new Error("Invalid inline Meta OAuth payload");
  }

  return parsed.data;
};

const decryptConnectionToken = (connection: MetaOAuthConnection) => {
  const secret = requireAppEncryptionSecret();

  return decryptString(connection.encryptedAccessToken, secret);
};

const normalizeMetaGrantedScopes = (
  grantedScopes?: readonly string[] | string | null,
) => {
  const rawScopes = Array.isArray(grantedScopes)
    ? grantedScopes
    : typeof grantedScopes === "string"
      ? grantedScopes.split(/[,\s]+/)
      : [];

  const normalized = Array.from(
    new Set(
      rawScopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0),
    ),
  ).sort();

  return normalized.length > 0 ? normalized : undefined;
};

const resolveFacebookPublishEnabled = (params: {
  pageId?: string;
  grantedScopes?: readonly string[];
}) => {
  if (!params.pageId?.trim()) {
    return false;
  }

  if (!params.grantedScopes) {
    return undefined;
  }

  return params.grantedScopes.includes(META_PAGE_PUBLISH_PERMISSION);
};

const buildMetaOAuthScopes = (scopeProfile: MetaOAuthScopeProfile) => {
  const scopes = new Set<string>(META_OAUTH_BASE_SCOPES);

  if (scopeProfile === "page-publishing") {
    META_OAUTH_PAGE_PUBLISH_SCOPES.forEach((scope) => scopes.add(scope));
  }

  return Array.from(scopes);
};

const buildResolvedMetaAccount = (params: {
  connectionId?: string;
  pageId?: string;
  pageName?: string;
  instagramUserId: string;
  instagramUsername?: string;
  instagramName?: string;
  tokenExpiresAt?: string;
  grantedScopes?: readonly string[];
}): ResolvedMetaAccount => ({
  connectionId: params.connectionId,
  accountKey: buildMetaAccountKey({
    pageId: params.pageId,
    instagramUserId: params.instagramUserId,
  }),
  pageId: params.pageId,
  pageName: params.pageName,
  instagramUserId: params.instagramUserId,
  instagramUsername: params.instagramUsername,
  instagramName: params.instagramName,
  tokenExpiresAt: params.tokenExpiresAt,
  capabilities: buildMetaDestinationCapabilities({
    pageId: params.pageId,
    instagramUserId: params.instagramUserId,
    facebookPublishEnabled: resolveFacebookPublishEnabled({
      pageId: params.pageId,
      grantedScopes: params.grantedScopes,
    }),
  }),
});

type SavedMetaConnection = {
  cookieValue: string;
  account: ResolvedMetaAccount;
};

const saveMetaConnection = async (params: {
  accessToken: string;
  tokenExpiresIn?: number;
  graphVersion: string;
  pageId: string;
  pageName: string;
  instagramUserId: string;
  instagramUsername: string;
  instagramName: string;
  instagramPictureUrl: string;
  grantedScopes?: string[];
}): Promise<SavedMetaConnection> => {
  const secret = requireAppEncryptionSecret();
  const now = new Date();
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
  const grantedScopes = normalizeMetaGrantedScopes(params.grantedScopes);
  const tokenExpiresAt = params.tokenExpiresIn
    ? new Date(now.getTime() + params.tokenExpiresIn * 1000).toISOString()
    : undefined;

  const connection = MetaOAuthConnectionSchema.parse({
    id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    graphVersion: params.graphVersion,
    pageId: params.pageId,
    pageName: params.pageName,
    instagramUserId: params.instagramUserId,
    instagramUsername: params.instagramUsername,
    instagramName: params.instagramName,
    instagramPictureUrl: params.instagramPictureUrl,
    tokenExpiresAt,
    grantedScopes,
    encryptedAccessToken: encryptString(params.accessToken, secret),
  });

  if (isCredentialStoreEnabled()) {
    await putCredentialRecord(META_CONNECTION_NAMESPACE, id, connection);
    return {
      cookieValue: connection.id,
      account: buildResolvedMetaAccount({
        connectionId: connection.id,
        pageId: connection.pageId,
        pageName: connection.pageName,
        instagramUserId: connection.instagramUserId,
        instagramUsername: connection.instagramUsername,
        instagramName: connection.instagramName,
        tokenExpiresAt: connection.tokenExpiresAt,
        grantedScopes: connection.grantedScopes,
      }),
    };
  }

  const inline = InlineMetaOAuthConnectionSchema.parse({
    graphVersion: params.graphVersion,
    pageId: params.pageId,
    instagramUserId: params.instagramUserId,
    instagramUsername: params.instagramUsername,
    instagramName: params.instagramName,
    pageName: params.pageName,
    tokenExpiresAt,
    grantedScopes,
    accessToken: params.accessToken,
  });
  const encryptedInline = encryptString(JSON.stringify(inline), secret);
  if (encryptedInline.length > 3500) {
    throw new Error(
      "OAuth payload is too large for cookie fallback. Configure POSTGRES_URL or DATABASE_URL for private persistent OAuth storage.",
    );
  }

  return {
    cookieValue: `${INLINE_CONNECTION_PREFIX}${encryptedInline}`,
    account: buildResolvedMetaAccount({
      pageId: inline.pageId,
      pageName: inline.pageName,
      instagramUserId: inline.instagramUserId,
      instagramUsername: inline.instagramUsername,
      instagramName: inline.instagramName,
      tokenExpiresAt: inline.tokenExpiresAt,
      grantedScopes: inline.grantedScopes,
    }),
  };
};

export const getMetaConnection = async (id: string) => {
  const record = await readCredentialRecord<unknown>(META_CONNECTION_NAMESPACE, id);
  if (!record) {
    return null;
  }

  const parsed = MetaOAuthConnectionSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
};

export const deleteMetaConnection = async (id: string) => {
  if (id.startsWith(INLINE_CONNECTION_PREFIX)) {
    return false;
  }

  return deleteCredentialRecord(META_CONNECTION_NAMESPACE, id);
};

export const getStoredMetaConnectionIdFromCookie = (cookieValue: string) => {
  const parsed = parseConnectionCookie(cookieValue);
  if (!parsed || parsed.kind !== "stored") {
    return "";
  }

  return parsed.id;
};

export const createMetaOAuthStartUrl = (
  origin: string,
  state: string,
  options: {
    scopeProfile?: MetaOAuthScopeProfile;
  } = {},
) => {
  const config = getMetaOAuthConfig(origin);
  if (!config) {
    throw new Error("Missing META_APP_ID or META_APP_SECRET");
  }

  const scopeProfile = options.scopeProfile ?? "page-publishing";
  const scope = buildMetaOAuthScopes(scopeProfile).join(",");

  const oauthUrl = new URL(
    `https://www.facebook.com/${config.graphVersion}/dialog/oauth`,
  );

  oauthUrl.searchParams.set("client_id", config.appId);
  oauthUrl.searchParams.set("redirect_uri", config.redirectUri);
  oauthUrl.searchParams.set("response_type", "code granted_scopes");
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("scope", scope);
  if (scopeProfile === "page-publishing") {
    oauthUrl.searchParams.set("auth_type", "rerequest");
  }

  return oauthUrl;
};

export const buildOAuthState = () => randomUUID().replace(/-/g, "");

export const completeMetaOAuth = async (
  req: Request,
  code: string,
  grantedScopes?: string[],
) => {
  const origin = new URL(req.url).origin;
  const config = getMetaOAuthConfig(origin);
  if (!config) {
    throw new Error("Missing META_APP_ID or META_APP_SECRET");
  }

  const shortTokenUrl = new URL(
    `https://graph.facebook.com/${config.graphVersion}/oauth/access_token`,
  );
  shortTokenUrl.searchParams.set("client_id", config.appId);
  shortTokenUrl.searchParams.set("client_secret", config.appSecret);
  shortTokenUrl.searchParams.set("redirect_uri", config.redirectUri);
  shortTokenUrl.searchParams.set("code", code);

  const shortToken = OAuthTokenSchema.parse(
    await callGraphJson<unknown>(shortTokenUrl),
  );

  let accessToken = shortToken.access_token;
  let expiresIn = shortToken.expires_in;

  try {
    const longTokenUrl = new URL(
      `https://graph.facebook.com/${config.graphVersion}/oauth/access_token`,
    );
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", config.appId);
    longTokenUrl.searchParams.set("client_secret", config.appSecret);
    longTokenUrl.searchParams.set("fb_exchange_token", shortToken.access_token);

    const longToken = OAuthTokenSchema.parse(
      await callGraphJson<unknown>(longTokenUrl),
    );

    accessToken = longToken.access_token;
    expiresIn = longToken.expires_in;
  } catch (error) {
    console.warn(
      "[meta-auth] Long-lived token exchange failed, using short-lived token:",
      error instanceof Error ? error.message : error,
    );
  }

  const pagesUrl = new URL(
    `https://graph.facebook.com/${config.graphVersion}/me/accounts`,
  );
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
  );
  pagesUrl.searchParams.set("access_token", accessToken);

  const pages = PagesResponseSchema.parse(await callGraphJson<unknown>(pagesUrl));
  const eligiblePages = pages.data.filter(
    (entry): entry is EligibleMetaOAuthPage =>
      Boolean(entry.instagram_business_account?.id) && Boolean(entry.access_token),
  );

  if (eligiblePages.length === 0) {
    throw new Error(
      "No Instagram business account found. Ensure the account is Business/Creator and linked to a Facebook Page.",
    );
  }

  if (eligiblePages.length > 1) {
    const pageLabels = eligiblePages
      .map((entry) => `${entry.name.trim() || "(unnamed)"} (${entry.id})`)
      .join(", ");
    console.warn(
      `[meta-auth] Multiple eligible Facebook Pages returned: ${pageLabels}`,
    );

    throw new ClientSafeError(
      `${eligiblePages.length} Facebook Pages with linked Instagram business accounts were returned by Meta OAuth. Limit this app's Page access to a single linked Page and reconnect.`,
    );
  }

  const [page] = eligiblePages;

  const connection = await saveMetaConnection({
    accessToken: page.access_token,
    tokenExpiresIn: expiresIn,
    graphVersion: config.graphVersion,
    pageId: page.id,
    pageName: page.name,
    instagramUserId: page.instagram_business_account.id,
    instagramUsername: page.instagram_business_account.username,
    instagramName: page.instagram_business_account.name,
    instagramPictureUrl: page.instagram_business_account.profile_picture_url,
    grantedScopes,
  });

  return connection;
};

export const resolveMetaAuthFromRequest = async (
  req: Request,
): Promise<ResolvedMetaAuth> => {
  const connectionCookie = readCookieFromRequest(req, META_CONNECTION_COOKIE);
  const parsedConnection = parseConnectionCookie(connectionCookie);

  if (parsedConnection?.kind === "inline") {
    try {
      const inline = decodeInlineConnection(parsedConnection.encryptedPayload);
      return {
        source: "oauth",
        auth: {
          accessToken: inline.accessToken,
          instagramUserId: inline.instagramUserId,
          pageId: inline.pageId,
          graphVersion: inline.graphVersion,
        },
        account: buildResolvedMetaAccount({
          pageId: inline.pageId,
          pageName: inline.pageName,
          instagramUserId: inline.instagramUserId,
          instagramUsername: inline.instagramUsername,
          instagramName: inline.instagramName,
          tokenExpiresAt: inline.tokenExpiresAt,
          grantedScopes: inline.grantedScopes,
        }),
      };
    } catch (error) {
      console.warn(
        "[meta-auth] Failed to decode inline OAuth credentials, falling back to env:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (parsedConnection?.kind === "stored" && isCredentialStoreEnabled()) {
    try {
      const connection = await getMetaConnection(parsedConnection.id);
      if (connection) {
        const token = decryptConnectionToken(connection);
        return {
          source: "oauth",
          auth: {
            accessToken: token,
            instagramUserId: connection.instagramUserId,
            pageId: connection.pageId,
            graphVersion: connection.graphVersion,
          },
          account: buildResolvedMetaAccount({
            connectionId: connection.id,
            pageId: connection.pageId,
            pageName: connection.pageName,
            instagramUserId: connection.instagramUserId,
            instagramUsername: connection.instagramUsername,
            instagramName: connection.instagramName,
            tokenExpiresAt: connection.tokenExpiresAt,
            grantedScopes: connection.grantedScopes,
          }),
        };
      }
    } catch (error) {
      console.warn(
        "[meta-auth] Failed to resolve OAuth credentials, falling back to env:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const env = getEnvMetaAuth();
  if (env) {
    return {
      source: "env",
      auth: env,
      account: buildResolvedMetaAccount({
        pageId: env.pageId,
        instagramUserId: env.instagramUserId,
      }),
    };
  }

  throw new Error(
    "Instagram account is not connected. Use Meta OAuth connect, or set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID.",
  );
};
