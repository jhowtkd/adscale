// Load-run database: our own pg Pool (configurable max) + drizzle + the
// Postgres Equipe unit of work. Never touches the app's global db pool.

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../src/server/db/schema";
import * as equipeSchema from "../../src/server/db/equipe-schema";
import { createPostgresEquipeUnitOfWork } from "../../src/server/equipe/data/postgres";
import { DrizzleLedgerStore } from "../../src/server/equipe/agents/ledger";
import type { Metrics } from "./metrics";

export type LoadDatabase = {
  pool: Pool;
  db: Parameters<typeof createPostgresEquipeUnitOfWork>[0];
  uow: ReturnType<typeof createPostgresEquipeUnitOfWork>;
  ledger: DrizzleLedgerStore;
};

export function createLoadDatabase(databaseUrl: string, poolMax: number): LoadDatabase {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
  });
  // Idle-client errors must never crash the run as unhandled 'error' events;
  // the failing query surfaces through its own await instead.
  pool.on("error", (error) => {
    console.error(`equipe-load: pool idle-client error: ${error.message}`);
  });
  const db = drizzle(pool, { schema: { ...schema, ...equipeSchema } });
  return {
    pool,
    db,
    uow: createPostgresEquipeUnitOfWork(db),
    ledger: new DrizzleLedgerStore(db),
  };
}

/** Backends on this database, excluding the sampler's own connection. */
export async function samplePgBackends(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from pg_stat_activity
     where datname = current_database() and pid <> pg_backend_pid()`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Background sampler: pool counters + pg_stat_activity every interval. */
export function startSampler(pool: Pool, metrics: Metrics, intervalMs = 2000): () => void {
  let stopped = false;
  let inFlight = false;
  const sample = () => {
    if (stopped || inFlight) return;
    inFlight = true;
    metrics.poolSamples.push({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    });
    samplePgBackends(pool)
      .then((backends) => metrics.pgBackends.push(backends))
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };
  const timer = setInterval(sample, intervalMs);
  sample();
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
