import { neon } from "@neondatabase/serverless";

export type CredentialNamespace = "llm" | "meta";

type SqlClient = ReturnType<typeof neon>;

const getDatabaseUrl = () => process.env.DATABASE_URL?.trim() || "";

const createSqlClient = (): SqlClient | null => {
  const url = getDatabaseUrl();
  if (!url) {
    return null;
  }

  return neon(url);
};

let initializePromise: Promise<void> | null = null;

const ensureTableReady = async (sql: SqlClient) => {
  if (!initializePromise) {
    initializePromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS ig_poster_private_credentials (
          namespace TEXT NOT NULL,
          credential_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (namespace, credential_id)
        )
      `;
    })();
  }

  try {
    await initializePromise;
  } catch (error) {
    initializePromise = null;
    throw error;
  }
};

const requireSqlClient = () => {
  const sql = createSqlClient();
  if (!sql) {
    throw new Error(
      "Missing DATABASE_URL. Configure a private Postgres database for credential storage.",
    );
  }

  return sql;
};

export const isCredentialStoreEnabled = () => Boolean(getDatabaseUrl());

export const putCredentialRecord = async (
  namespace: CredentialNamespace,
  credentialId: string,
  payload: unknown,
) => {
  const sql = requireSqlClient();
  await ensureTableReady(sql);
  await sql`
    INSERT INTO ig_poster_private_credentials (namespace, credential_id, payload)
    VALUES (${namespace}, ${credentialId}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (namespace, credential_id)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()
  `;
};

export const readCredentialRecord = async <T>(
  namespace: CredentialNamespace,
  credentialId: string,
): Promise<T | null> => {
  const sql = createSqlClient();
  if (!sql) {
    return null;
  }

  await ensureTableReady(sql);
  const rows = (await sql`
    SELECT payload
    FROM ig_poster_private_credentials
    WHERE namespace = ${namespace}
      AND credential_id = ${credentialId}
    LIMIT 1
  `) as Array<{ payload: T }>;

  return rows[0]?.payload ?? null;
};

export const deleteCredentialRecord = async (
  namespace: CredentialNamespace,
  credentialId: string,
) => {
  const sql = createSqlClient();
  if (!sql) {
    return false;
  }

  await ensureTableReady(sql);
  const rows = (await sql`
    DELETE FROM ig_poster_private_credentials
    WHERE namespace = ${namespace}
      AND credential_id = ${credentialId}
    RETURNING 1 AS deleted
  `) as Array<{ deleted: number }>;

  return rows.length > 0;
};
