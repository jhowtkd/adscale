import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "../drizzle");
const attempts = Number(process.env.DB_MIGRATE_ATTEMPTS ?? 5);
const delayMs = Number(process.env.DB_MIGRATE_DELAY_MS ?? 8000);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function logDbTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    return;
  }
  try {
    const parsed = new URL(url);
    console.log(
      `DATABASE_URL host=${parsed.hostname} db=${parsed.pathname.replace("/", "")}`
    );
  } catch {
    console.log("DATABASE_URL is set (unparseable URL)");
  }
}

async function countSqlMigrations() {
  const files = await readdir(migrationsFolder);
  return files.filter((file) => file.endsWith(".sql")).length;
}

async function countAppliedMigrations(client) {
  const result = await client
    .query(`SELECT COUNT(*)::int AS count FROM public."__drizzle_migrations"`)
    .catch(() => ({ rows: [{ count: 0 }] }));
  return result.rows[0]?.count ?? 0;
}

async function countAppTables(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'adscale_app'`
  );
  return result.rows[0]?.count ?? 0;
}

function isTransientDbError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection terminated|too many clients/i.test(
    message
  );
}

async function runMigrationAttempt() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS "adscale_app"');

    const [sqlCount, appliedBefore, tableCount] = await Promise.all([
      countSqlMigrations(),
      countAppliedMigrations(pool),
      countAppTables(pool),
    ]);

    console.log(
      `[db:migrate] sql files=${sqlCount}, journal=${appliedBefore}, adscale_app tables=${tableCount}`
    );

    if (tableCount > 0 && appliedBefore === 0) {
      throw new Error(
        `schema drift: adscale_app already has ${tableCount} tables but migration journal is empty. ` +
          `Refuse to replay migrations on a populated database. Baseline the journal or use a fresh database.`
      );
    }

    if (appliedBefore > 0 && appliedBefore >= sqlCount && tableCount > 0) {
      console.log("[db:migrate] already up to date");
      return;
    }

    await migrate(db, { migrationsFolder });

    const appliedAfter = await countAppliedMigrations(pool);
    console.log(`[db:migrate] journal after=${appliedAfter}`);

    if (appliedAfter < sqlCount && appliedAfter === appliedBefore) {
      throw new Error(
        `no pending migrations were applied (${appliedBefore}/${sqlCount} recorded)`
      );
    }

    if (appliedAfter > sqlCount) {
      throw new Error(
        `migration journal (${appliedAfter}) exceeds SQL files (${sqlCount})`
      );
    }
  } finally {
    await pool.end();
  }
}

logDbTarget();

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  console.log(`[db:migrate] attempt ${attempt}/${attempts}`);
  try {
    await runMigrationAttempt();
    console.log("[db:migrate] success");
    process.exit(0);
  } catch (error) {
    console.error(
      `[db:migrate] attempt ${attempt} failed`,
      error instanceof Error ? error.message : error
    );
    if (!isTransientDbError(error) || attempt === attempts) {
      process.exit(1);
    }
    console.log(`[db:migrate] retrying in ${delayMs}ms`);
    sleep(delayMs);
  }
}
