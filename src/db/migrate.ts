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
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function run() {
  const url =
    process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!url) {
    console.log("⏭  No database URL set — skipping migrations.");
    return;
  }

  console.log("🔄 Running Drizzle migrations…");

  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("✅ Migrations up to date.");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
