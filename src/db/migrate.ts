/**
 * Run pending Drizzle migrations against the production database.
 *
 * Reads the migration journal from `drizzle/` and applies any SQL files
 * that haven't been recorded in the `__drizzle_migrations` table yet.
 *
 * Usage:
 *   npx tsx src/db/migrate.ts          # standalone
 *   npm run db:migrate                 # via package script
 *
 * The Vercel build command calls this before `next build` so every
 * deploy automatically picks up new migrations.
 *
 * NOTE: Neon HTTP driver does not support transactions — if a migration
 * fails partway through, you must fix the DB manually before retrying.
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

// Load .env.local / .env so DB URLs are available outside of Next.js runtime
loadEnvConfig(process.cwd());

async function run() {
  let url: string | undefined;
  try {
    const { resolveDatabaseUrl } = await import("./index");
    url = resolveDatabaseUrl();
  } catch {
    console.log("⏭  No database URL set — skipping migrations.");
    return;
  }

  console.log("🔄 Running Drizzle migrations…");

  const db = drizzle(neon(url));
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });

  console.log("✅ Migrations up to date.");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
