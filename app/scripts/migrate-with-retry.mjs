import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ensureMigrationLedger } from "./migration-ledger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "../drizzle");
const attempts = Number(process.env.DB_MIGRATE_ATTEMPTS ?? 5);
const delayMs = Number(process.env.DB_MIGRATE_DELAY_MS ?? 8000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt) {
  const exponential = delayMs * 2 ** (attempt - 1);
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.round(exponential * jitter);
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

function hashMigrationSql(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function isAlreadyExistsError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|duplicate key|duplicate_object/i.test(message);
}

function isTransientDbError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection terminated|too many clients/i.test(
    message
  );
}

async function readJournal() {
  const raw = await readFile(
    path.join(migrationsFolder, "meta/_journal.json"),
    "utf8"
  );
  return JSON.parse(raw);
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

async function loadAppliedHashes(client) {
  const result = await client.query(`SELECT hash FROM public."__drizzle_migrations"`);
  return new Set(result.rows.map((row) => row.hash));
}

async function recordMigration(client, hash, createdAt) {
  await client.query(
    `INSERT INTO public."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
    [hash, createdAt]
  );
}

async function runStatements(client, statements, tag) {
  for (const statement of statements) {
    const sql = statement.trim();
    if (!sql) continue;
    try {
      await client.query(sql);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        console.warn(`[db:migrate] skip existing object in ${tag}`);
        continue;
      }
      throw error;
    }
  }
}

async function applyPendingJournalMigrations(client, tableCount) {
  const journal = await readJournal();
  const appliedHashes = await loadAppliedHashes(client);
  let appliedNow = 0;

  for (const entry of journal.entries) {
    const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
    const sql = await readFile(sqlPath, "utf8");
    const hash = hashMigrationSql(sql);

    if (appliedHashes.has(hash)) {
      continue;
    }

    if (entry.tag === "0000_sleepy_moon_knight" && tableCount > 0) {
      await recordMigration(client, hash, entry.when);
      appliedHashes.add(hash);
      appliedNow += 1;
      console.log(`[db:migrate] baselined ${entry.tag} (schema already present)`);
      continue;
    }

    console.log(`[db:migrate] applying ${entry.tag}`);
    const statements = sql.split("--> statement-breakpoint");
    await runStatements(client, statements, entry.tag);
    await recordMigration(client, hash, entry.when);
    appliedHashes.add(hash);
    appliedNow += 1;
  }

  return appliedNow;
}

async function runMigrationAttempt() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS "adscale_app"');
    await ensureMigrationLedger(pool);

    const journal = await readJournal();
    const journalCount = journal.entries.length;
    const [appliedBefore, tableCount] = await Promise.all([
      countAppliedMigrations(pool),
      countAppTables(pool),
    ]);

    console.log(
      `[db:migrate] journal entries=${journalCount}, applied=${appliedBefore}, adscale_app tables=${tableCount}`
    );

    if (tableCount > 0 && appliedBefore === 0) {
      console.log(
        "[db:migrate] populated schema with empty journal — baselining/applying pending migrations"
      );
    }

    const appliedNow = await applyPendingJournalMigrations(pool, tableCount);
    const appliedAfter = await countAppliedMigrations(pool);
    console.log(`[db:migrate] applied now=${appliedNow}, journal after=${appliedAfter}`);

    if (appliedAfter < journalCount && appliedNow === 0 && appliedBefore === appliedAfter) {
      throw new Error(
        `no pending migrations were applied (${appliedAfter}/${journalCount} recorded)`
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
    const backoff = retryDelayMs(attempt);
    console.log(`[db:migrate] retrying in ${backoff}ms`);
    await sleep(backoff);
  }
}
