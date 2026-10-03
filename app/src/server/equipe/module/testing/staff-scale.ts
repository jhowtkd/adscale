// Bulk seeding for the staff-scale Postgres suites (ticket 11). Everything runs inside ONE outer transaction that is
// rolled back at the end: the database is shared and CI runs files in parallel, so thousands of committed accounts (or
// a committed global stop) would disturb the other suites. Import only AFTER DATABASE_URL was routed to the test
// database (see the callers, which load this file dynamically).

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import * as equipeSchema from "@/server/db/equipe-schema";
import { createPostgresEquipeUnitOfWork } from "../../data/postgres";
import type { EquipeUnitOfWork } from "../../data";

export class RollbackSignal extends Error {
  constructor() {
    super("staff_scale_rollback");
  }
}

export type CountingDb = ReturnType<typeof openCountingDb>;

/** A pool + drizzle whose every statement is pushed to `statements`, so the tests can count queries. */
export function openCountingDb(url: string) {
  const statements: string[] = [];
  const pool = new Pool({ connectionString: url, max: 4 });
  const db = drizzle(pool, {
    schema: { ...schema, ...equipeSchema },
    logger: { logQuery: (query: string) => { statements.push(query); } },
  });
  return { pool, db, statements };
}

export type ScaleTx = Parameters<Parameters<CountingDb["db"]["transaction"]>[0]>[0];

/** Runs `fn` in a transaction and always rolls it back; any other error propagates. */
export async function inRolledBackTransaction(counting: CountingDb, fn: (tx: ScaleTx) => Promise<void>): Promise<void> {
  try {
    await counting.db.transaction(async (tx) => {
      await fn(tx);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
}

/**
 * Opens a transaction and keeps it open until `finish()`, which rolls it back: lets several tests share one expensive
 * seed (read-only on it) without ever committing it. Pair `open()` with `finish()` in beforeAll/afterAll.
 */
export function heldRolledBackTransaction(counting: CountingDb) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let finished: Promise<void> = Promise.resolve();
  return {
    open: () => new Promise<ScaleTx>((resolve, reject) => {
      finished = inRolledBackTransaction(counting, async (tx) => {
        resolve(tx);
        await released;
      }).catch(reject);
    }),
    finish: async () => {
      release();
      await finished;
    },
  };
}

export const uowOf = (tx: ScaleTx): EquipeUnitOfWork => createPostgresEquipeUnitOfWork(tx as never);

export type Seeded = { id: string; workspaceId: string };

/** `count` workspaces, brands and accounts of one status, created in order (created_at strictly increasing). */
export async function seedAccounts(tx: ScaleTx, count: number, status: string): Promise<Seeded[]> {
  const result = await tx.execute(sql`
    with ws as (
      insert into adscale_app.workspaces (id, name, slug)
      select gen_random_uuid(), 'Workspace s11 ' || g, 's11-' || gen_random_uuid() from generate_series(1, ${count}::int) g
      returning id, name
    ), pr as (
      insert into adscale_app.client_profiles (id, workspace_id, name)
      select gen_random_uuid(), id, 'Marca ' || name from ws returning id, workspace_id
    )
    insert into adscale_equipe.equipe_accounts (id, workspace_id, client_profile_id, status, created_at)
    select gen_random_uuid(), workspace_id, id, ${status}, clock_timestamp() from pr
    returning id, workspace_id as "workspaceId"`);
  return result.rows as Seeded[];
}

const anyUuid = (ids: readonly string[]) => sql`any(${sql.param([...ids])}::uuid[])`;

/**
 * One `notification.requested` event per account. Every request gets a terminal receipt ("completed") except those of
 * `pendingIds`, which stay pending: what the notification sweep reads for free accounts.
 */
export async function seedNotificationRequests(tx: ScaleTx, accounts: readonly Seeded[], pendingIds: readonly string[]): Promise<void> {
  await tx.execute(sql`
    with ev as (
      insert into adscale_equipe.equipe_events (id, workspace_id, account_id, actor_type, event_type, occurred_at)
      select gen_random_uuid(), a.workspace_id, a.id, 'system', 'notification.requested', now()
      from adscale_equipe.equipe_accounts a where a.id = ${anyUuid(accounts.map((account) => account.id))}
      returning id, workspace_id, account_id
    )
    insert into adscale_equipe.equipe_notification_deliveries (id, workspace_id, account_id, event_id, channels)
    select gen_random_uuid(), workspace_id, account_id, id, '["inapp","email","completed"]'::jsonb
    from ev where account_id <> all(${sql.param([...pendingIds])}::uuid[])`);
}

export const insertException = (tx: ScaleTx, account: Seeded, status: string) => tx.execute(sql`
  insert into adscale_equipe.equipe_exceptions (id, workspace_id, account_id, trigger, status)
  values (gen_random_uuid(), ${account.workspaceId}::uuid, ${account.id}::uuid, 'sem_material', ${status})`);

export const insertEscalation = (tx: ScaleTx, account: Seeded, status: string) => tx.execute(sql`
  insert into adscale_equipe.equipe_escalations (id, workspace_id, account_id, kind, severity, owner_role, status)
  values (gen_random_uuid(), ${account.workspaceId}::uuid, ${account.id}::uuid, 'conteudo', 'high', 'quality', ${status})`);

export const insertPause = (tx: ScaleTx, account: Seeded, status: string) => tx.execute(sql`
  insert into adscale_equipe.equipe_pauses (id, workspace_id, account_id, level, scope, origin, resumable_by, status)
  values (gen_random_uuid(), ${account.workspaceId}::uuid, ${account.id}::uuid, 'publishing', 'account', 'client_request', 'approver', ${status})`);

export const insertMandate = (tx: ScaleTx, account: Seeded, version: number, status: string, shadow: boolean) => tx.execute(sql`
  insert into adscale_equipe.equipe_mandates (id, workspace_id, account_id, version, status, shadow)
  values (gen_random_uuid(), ${account.workspaceId}::uuid, ${account.id}::uuid, ${version}, ${status}, ${shadow})`);

export type ScaleFixture = {
  idleFree: Seeded[];
  /** The two idle free accounts whose notification request has no receipt yet. */
  pendingNotificationFree: Seeded[];
  paid: { deploying: Seeded; active: Seeded; suspended: Seeded; closed: Seeded };
  /** free accounts with something open: they must show in the pipeline */
  openFree: { exception: Seeded; claimed: Seeded; escalation: Seeded };
  /** free accounts with only closed/lifted/resolved rows: they must NOT show */
  doneFree: { exception: Seeded; pause: Seeded; escalation: Seeded };
};

/**
 * The shared dataset: `idleFree` free accounts with nothing open (each with a notification request and its terminal
 * receipt, but two), 4 paid accounts (the `active` one with an open escalation, an active pause and an approved shadow
 * mandate), 3 free accounts with something open and 3 free ones with only finished rows.
 */
export async function seedScaleFixture(tx: ScaleTx, idleFreeCount: number): Promise<ScaleFixture> {
  const idleFree = await seedAccounts(tx, idleFreeCount, "free");
  const pendingNotificationFree = [idleFree[0]!, idleFree[1]!];
  await seedNotificationRequests(tx, idleFree, pendingNotificationFree.map((account) => account.id));
  const one = async (status: string) => (await seedAccounts(tx, 1, status))[0]!;
  const paid = { deploying: await one("deploying"), active: await one("active"), suspended: await one("suspended"), closed: await one("closed") };
  await insertEscalation(tx, paid.active, "awaiting_client");
  await insertPause(tx, paid.active, "active");
  await insertMandate(tx, paid.active, 1, "approved", true);
  const openFree = { exception: await one("free"), claimed: await one("free"), escalation: await one("free") };
  await insertException(tx, openFree.exception, "open");
  await insertException(tx, openFree.claimed, "claimed");
  await insertEscalation(tx, openFree.escalation, "open");
  const doneFree = { exception: await one("free"), pause: await one("free"), escalation: await one("free") };
  await insertException(tx, doneFree.exception, "closed");
  await insertPause(tx, doneFree.pause, "lifted");
  await insertEscalation(tx, doneFree.escalation, "resolved");
  return { idleFree, pendingNotificationFree, paid, openFree, doneFree };
}

/**
 * The only wall-clock limit of the scale suites, and it is a net, not a measurement. The shape of the work is pinned by
 * the statement counts and by the results, which do not depend on the machine. Time does: the database is shared, CI
 * runs the files in parallel on a loaded runner, and one stall breaks any limit near the normal cost (a sweep that takes
 * a few milliseconds here once took 2.4 s there, in a run where every other file was 1.6x slower). Tens of seconds only
 * catches a hang or a lock wait; a loop over the accounts is caught by the counts.
 */
export const WALL_CLOCK_GUARD_MS = 30_000;

/** Measures a block: the statements it issued and how long it took. */
export async function measured<T>(counting: CountingDb, fn: () => Promise<T>): Promise<{ value: T; queries: number; ms: number }> {
  const before = counting.statements.length;
  const started = performance.now();
  const value = await fn();
  return { value, queries: counting.statements.length - before, ms: performance.now() - started };
}
