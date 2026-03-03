import { randomBytes } from "node:crypto";

const trimEnv = (value: string | undefined) => value?.trim() || "";

const resolveConfiguredSecret = () =>
  trimEnv(process.env.APP_ENCRYPTION_SECRET) ||
  trimEnv(process.env.META_APP_SECRET) ||
  trimEnv(process.env.WORKSPACE_AUTH_SECRET);

const getDevRuntimeSecret = () => {
  const globalState = globalThis as typeof globalThis & {
    __igPosterDevEncryptionSecret?: string;
    __igPosterDevEncryptionSecretWarned?: boolean;
  };

  if (!globalState.__igPosterDevEncryptionSecret) {
    globalState.__igPosterDevEncryptionSecret = randomBytes(32).toString("hex");
  }

  if (!globalState.__igPosterDevEncryptionSecretWarned) {
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
