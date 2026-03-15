import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

let _db: NeonDatabase<typeof schema> | null = null;

export const resolveDatabaseUrl = () => {
  const postgresUrl = process.env.POSTGRES_URL?.trim();
  if (postgresUrl) {
    return postgresUrl;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error(
    "Database URL is not set. Configure POSTGRES_URL or DATABASE_URL.",
  );
};

export function getDb() {
  if (!_db) {
    const url = resolveDatabaseUrl();
    const pool = new Pool({ connectionString: url });
    _db = drizzle(pool, { schema });
  }
  return _db;
}
