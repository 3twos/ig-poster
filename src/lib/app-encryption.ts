import { createHmac, randomBytes } from "node:crypto";

const MISSING_ENCRYPTION_SECRET_ERROR =
  "Missing APP_ENCRYPTION_SECRET, META_APP_SECRET, or WORKSPACE_AUTH_SECRET in production";

const resolveEnvSecret = (value: string | undefined) => {
  if (value === undefined) {
    return "";
  }

  if (value.trim() === "") {
    return "";
  }

  // Keep the original value to avoid changing effective keys for existing data.
  return value;
};

const deriveWorkspaceEncryptionSecret = (workspaceSecret: string) =>
  createHmac("sha256", "ig-poster:app-encryption:workspace-secret-v1")
    .update(workspaceSecret)
    .digest("hex");

const resolveConfiguredSecret = () => {
  const appSecret = resolveEnvSecret(process.env.APP_ENCRYPTION_SECRET);
  if (appSecret) {
    return appSecret;
  }

  const metaSecret = resolveEnvSecret(process.env.META_APP_SECRET);
  if (metaSecret) {
    return metaSecret;
  }

  const workspaceSecret = resolveEnvSecret(process.env.WORKSPACE_AUTH_SECRET);
  if (workspaceSecret) {
    return deriveWorkspaceEncryptionSecret(workspaceSecret);
  }

  return "";
};

const getDevRuntimeSecret = () => {
  const globalState = globalThis as typeof globalThis & {
    __igPosterDevEncryptionSecret?: string;
    __igPosterDevEncryptionSecretWarned?: boolean;
  };

  if (!globalState.__igPosterDevEncryptionSecret) {
    globalState.__igPosterDevEncryptionSecret = randomBytes(32).toString("hex");
  }

  if (
    process.env.NODE_ENV === "development" &&
    !globalState.__igPosterDevEncryptionSecretWarned
  ) {
    console.warn(
      "No APP_ENCRYPTION_SECRET, META_APP_SECRET, or WORKSPACE_AUTH_SECRET set. Using temporary runtime encryption secret (non-production only).",
    );
    globalState.__igPosterDevEncryptionSecretWarned = true;
  }

  return globalState.__igPosterDevEncryptionSecret;
};

export const getAppEncryptionSecret = () => {
  const configured = resolveConfiguredSecret();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return getDevRuntimeSecret();
  }

  return "";
};

export const requireAppEncryptionSecret = (context?: string) => {
  const secret = getAppEncryptionSecret();
  if (secret) {
    return secret;
  }

  if (context) {
    throw new Error(`${MISSING_ENCRYPTION_SECRET_ERROR} (${context})`);
  }

  throw new Error(MISSING_ENCRYPTION_SECRET_ERROR);
};
