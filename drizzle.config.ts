import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim();

if (!dbUrl) {
  throw new Error("POSTGRES_URL or DATABASE_URL must be set for Drizzle.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
