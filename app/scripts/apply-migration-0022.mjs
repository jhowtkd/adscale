/**
 * Applies migration 0022 (derivations workspace+created_at index) and registers it in drizzle.__drizzle_migrations.
 * Usage: node scripts/apply-migration-0022.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const migrationPath = resolve(__dirname, "../drizzle/0022_derivations_workspace_created_at_idx.sql");
const migrationSql = readFileSync(migrationPath, "utf8");
const hash = createHash("sha256").update(migrationSql).digest("hex");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing — set in .env.local");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  await sql.unsafe(migrationSql);

  const existing = await sql`SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
  if (existing.length === 0) {
    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`;
    console.log("registered migration 0022");
  } else {
    console.log("migration 0022 already registered");
  }

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'adscale_app' AND indexname = 'derivations_workspace_created_at_idx'
  `;
  console.log(idx.length ? "index: OK" : "index: MISSING");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
