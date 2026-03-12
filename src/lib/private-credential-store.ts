import { neon } from "@neondatabase/serverless";

export type CredentialNamespace =
  | "llm"
  | "meta"
  | "cli_session"
  | "cli_device_code";

type SqlClient = ReturnType<typeof neon>;

const getDatabaseUrl = () =>
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

let cachedSqlClient: SqlClient | null | undefined;

const createSqlClient = (): SqlClient | null => {
  if (cachedSqlClient !== undefined) return cachedSqlClient;
  const url = getDatabaseUrl();
  cachedSqlClient = url ? neon(url) : null;
  return cachedSqlClient;
};

let initializePromise: Promise<void> | null = null;

const CREDENTIAL_STORE_MIGRATION_HINT =
  "Ensure table ig_poster_private_credentials exists and DB user has SELECT/INSERT/UPDATE/DELETE access. Run provisioning SQL:\n" +
  "CREATE TABLE IF NOT EXISTS ig_poster_private_credentials (\n" +
  "  namespace TEXT NOT NULL,\n" +
  "  credential_id TEXT NOT NULL,\n" +
  "  payload JSONB NOT NULL,\n" +
  "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n" +
  "  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n" +
  "  PRIMARY KEY (namespace, credential_id)\n" +
  ");";

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
    const detail =
      error instanceof Error ? error.message : "Unknown table initialization error";
    throw new Error(
      `Credential store initialization failed: ${detail}. ${CREDENTIAL_STORE_MIGRATION_HINT}`,
    );
  }
};

const requireSqlClient = () => {
  const sql = createSqlClient();
  if (!sql) {
    throw new Error(
      "Missing POSTGRES_URL or DATABASE_URL. Configure a private Postgres database for credential storage.",
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

export const listCredentialRecords = async <T>(
  namespace: CredentialNamespace,
): Promise<Array<{ credentialId: string; payload: T }>> => {
  const sql = createSqlClient();
  if (!sql) {
    return [];
  }

  await ensureTableReady(sql);
  const rows = (await sql`
    SELECT credential_id, payload
    FROM ig_poster_private_credentials
    WHERE namespace = ${namespace}
    ORDER BY created_at ASC
  `) as Array<{ credential_id: string; payload: T }>;

  return rows.map((row) => ({
    credentialId: row.credential_id,
    payload: row.payload,
  }));
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
