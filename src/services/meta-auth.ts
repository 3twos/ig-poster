import { getEnvMetaAuth } from "@/lib/meta";
import {
  getEncryptionSecret,
  getMetaConnection,
  MetaOAuthConnectionSchema,
  type MetaOAuthConnection,
  type ResolvedMetaAuth,
} from "@/lib/meta-auth";
import {
  isCredentialStoreEnabled,
  listCredentialRecords,
} from "@/lib/private-credential-store";
import { decryptString } from "@/lib/secure";

const NOT_CONNECTED_MESSAGE =
  "Instagram account is not connected. Use Meta OAuth connect, or set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ID.";

export class MetaAuthServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MetaAuthServiceError";
    this.status = status;
  }
}

const resolveStoredMetaConnection = (
  connection: MetaOAuthConnection,
): ResolvedMetaAuth => {
  const secret = getEncryptionSecret();
  if (!secret) {
    throw new MetaAuthServiceError(
      500,
      "Stored Meta OAuth credentials require APP_ENCRYPTION_SECRET.",
    );
  }

  let accessToken = "";
  try {
    accessToken = decryptString(connection.encryptedAccessToken, secret);
  } catch (error) {
    throw new MetaAuthServiceError(
      500,
      error instanceof Error
        ? `Failed to decrypt stored Meta OAuth credentials: ${error.message}`
        : "Failed to decrypt stored Meta OAuth credentials.",
    );
  }

  return {
    source: "oauth",
    auth: {
      accessToken,
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
};

const readLatestStoredMetaConnection = async () => {
  if (!isCredentialStoreEnabled()) {
    return null;
  }

  const records = await listCredentialRecords<unknown>("meta");
  const parsedConnections = records
    .map((record) => MetaOAuthConnectionSchema.safeParse(record.payload))
    .filter((result) => result.success)
    .map((result) => result.data);

  return parsedConnections.at(-1) ?? null;
};

export const resolveMetaAuthForApi = async (options: {
  connectionId?: string;
} = {}): Promise<ResolvedMetaAuth> => {
  if (options.connectionId) {
    if (!isCredentialStoreEnabled()) {
      throw new MetaAuthServiceError(
        400,
        "Stored Meta OAuth connections require POSTGRES_URL or DATABASE_URL.",
      );
    }

    const connection = await getMetaConnection(options.connectionId);
    if (!connection) {
      throw new MetaAuthServiceError(404, "Meta connection not found.");
    }

    return resolveStoredMetaConnection(connection);
  }

  const latestConnection = await readLatestStoredMetaConnection();
  if (latestConnection) {
    return resolveStoredMetaConnection(latestConnection);
  }

  const envAuth = getEnvMetaAuth();
  if (envAuth) {
    return {
      source: "env",
      auth: envAuth,
      account: {
        instagramUserId: envAuth.instagramUserId,
      },
    };
  }

  throw new MetaAuthServiceError(401, NOT_CONNECTED_MESSAGE);
};
