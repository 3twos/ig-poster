import { randomUUID } from "node:crypto";

import { z } from "zod";

import { deleteBlobByPath, isBlobEnabled, putJson, readJsonByPath } from "@/lib/blob-store";
import {
  getAppEncryptionSecret,
  requireAppEncryptionSecret,
} from "@/lib/app-encryption";
import { readCookieFromRequest } from "@/lib/cookies";
import { getEnvMetaAuth, type MetaAuthContext } from "@/lib/meta";
import { decryptString, encryptString } from "@/lib/secure";

export { readCookieFromRequest } from "@/lib/cookies";

export const META_OAUTH_STATE_COOKIE = "meta_oauth_state";
export const META_CONNECTION_COOKIE = "ig_connection";

const graphVersion = process.env.META_GRAPH_VERSION ?? "v22.0";

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
  encryptedAccessToken: z.string().min(12),
});

export type MetaOAuthConnection = z.infer<typeof MetaOAuthConnectionSchema>;

export type ResolvedMetaAuth = {
  source: "oauth" | "env";
  auth: MetaAuthContext;
  account: {
    connectionId?: string;
    instagramUserId: string;
    instagramUsername?: string;
    instagramName?: string;
    pageName?: string;
    tokenExpiresAt?: string;
  };
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
  const json = (await response.json()) as { error?: { message?: string } } & T;

  if (!response.ok || json.error) {
    throw new Error(json.error?.message ?? "Meta API request failed");
  }

  return json;
};

const getConnectionPath = (id: string) => `auth/meta/connections/${id}.json`;

const decryptConnectionToken = (connection: MetaOAuthConnection) => {
  const secret = requireAppEncryptionSecret();

  return decryptString(connection.encryptedAccessToken, secret);
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
}) => {
  if (!isBlobEnabled()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for OAuth connections");
  }

  const secret = requireAppEncryptionSecret();

  const now = new Date();
  const id = randomUUID().replace(/-/g, "").slice(0, 20);
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
    encryptedAccessToken: encryptString(params.accessToken, secret),
  });

  await putJson(getConnectionPath(id), connection);
  return connection;
};

export const getMetaConnection = async (id: string) => {
  const record = await readJsonByPath<unknown>(getConnectionPath(id));
  if (!record) {
    return null;
  }

  const parsed = MetaOAuthConnectionSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
};

export const deleteMetaConnection = async (id: string) => {
  if (!isBlobEnabled()) {
    return false;
  }

  return deleteBlobByPath(getConnectionPath(id));
};

export const createMetaOAuthStartUrl = (origin: string, state: string) => {
  const config = getMetaOAuthConfig(origin);
  if (!config) {
    throw new Error("Missing META_APP_ID or META_APP_SECRET");
  }

  const scope = [
    "instagram_basic",
    "instagram_content_publish",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ].join(",");

  const oauthUrl = new URL(
    `https://www.facebook.com/${config.graphVersion}/dialog/oauth`,
  );

  oauthUrl.searchParams.set("client_id", config.appId);
  oauthUrl.searchParams.set("redirect_uri", config.redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("state", state);
  oauthUrl.searchParams.set("scope", scope);

  return oauthUrl;
};

export const buildOAuthState = () => randomUUID().replace(/-/g, "");

export const completeMetaOAuth = async (req: Request, code: string) => {
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
  } catch {
    // Fall back to short-lived token when long-lived exchange is unavailable.
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
  const page = pages.data.find(
    (entry) => Boolean(entry.instagram_business_account?.id) && Boolean(entry.access_token),
  );

  if (!page || !page.instagram_business_account) {
    throw new Error(
      "No Instagram business account found. Ensure the account is Business/Creator and linked to a Facebook Page.",
    );
  }

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
  });

  return connection;
};

export const resolveMetaAuthFromRequest = async (
  req: Request,
): Promise<ResolvedMetaAuth> => {
  const connectionId = readCookieFromRequest(req, META_CONNECTION_COOKIE);

  if (connectionId && isBlobEnabled()) {
    try {
      const connection = await getMetaConnection(connectionId);
      if (connection) {
        const token = decryptConnectionToken(connection);
        return {
          source: "oauth",
          auth: {
            accessToken: token,
            instagramUserId: connection.instagramUserId,
            graphVersion: connection.graphVersion,
          },
          account: {
            connectionId: connection.id,
            instagramUserId: connection.instagramUserId,
            instagramUsername: connection.instagramUsername,
            instagramName: connection.instagramName,
            pageName: connection.pageName,
            tokenExpiresAt: connection.tokenExpiresAt,
          },
        };
      }
    } catch {
      // Fallback to env credentials when OAuth cookie is stale or undecryptable.
    }
  }

  const env = getEnvMetaAuth();
  if (env) {
    return {
      source: "env",
      auth: env,
      account: {
        instagramUserId: env.instagramUserId,
      },
    };
  }

  throw new Error(
    "Instagram account is not connected. Use Meta OAuth connect, or set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID.",
  );
};
