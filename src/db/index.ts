import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

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
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}
