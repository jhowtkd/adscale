/**
 * The free plan's early person request (`request_support` WITHOUT purpose, with the plan note) against REAL Postgres,
 * with two independent connections (R3 of the PR 626 review): two simultaneous requests must create ONE exception.
 *
 * Deterministic barrier, no clock: each request is paused right AFTER it reads the account's exceptions (the "is there
 * an open one?" read). The controller releases them only when both have read (nothing serialized them: both saw none) or
 * when one has read and the other is blocked by a Postgres lock held by it (the account lock of the `earlyPlanPerson`
 * branch). Without that lock both read "none" and both create; with it the second waits, then finds the first one.
 * The database is shared: every assertion is about the workspace created here, and it is deleted at the end.
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/equipe/module/request-support-person.pg.test.ts
 */
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

async function load() {
  const [free, { executeCommand }, { Pool }, { drizzle }, schema, equipeSchema, { createPostgresEquipeUnitOfWork }, fixed] =
    await Promise.all([
      import("./testing/free-pg"), import("./commands"), import("pg"), import("drizzle-orm/node-postgres"),
      import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("../data/postgres"),
      import("@/lib/equipe/fixed-replies"),
    ]);
  return { free, executeCommand, Pool, drizzle, schema, equipeSchema, createPostgresEquipeUnitOfWork, note: fixed.PLAN_PERSON_NOTE };
}
type Mods = Awaited<ReturnType<typeof load>>;
type Uow = ReturnType<Mods["createPostgresEquipeUnitOfWork"]>;

const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;

describe.skipIf(!ENABLED)("request_support, the free plan's person request, two connections (pg)", () => {
  let m: Mods;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    if (!m) return;
    const h = m.free.openPool(TEST_DATABASE_URL!);
    try { await m.free.cleanup(h, workspaceIds, userIds); } finally { await h.pool.end(); }
    for (const close of closers.splice(0)) await close();
  }, 60_000);

  async function setup() {
    m ??= await load();
    (m.free.assertTestDatabase as (url: string | null) => void)(TEST_DATABASE_URL);
    // Independent pools (each one a separate "process"), warmed: one dedicated client each, with its backend pid known.
    const h = m.free.openPool(TEST_DATABASE_URL!);
    const connections = [0, 1].map(() => new m.Pool({ connectionString: TEST_DATABASE_URL!, max: 1 }));
    const clients = await Promise.all(connections.map((pool) => pool.connect()));
    closers.push(async () => {
      clients.forEach((client) => client.release());
      await Promise.all([...connections.map((pool) => pool.end()), h.pool.end()]);
    });
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
    for (const client of clients) await client.query("select 1");
    const pids = await Promise.all(clients.map(async (c) => (await c.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid));
    const uows = clients.map((client) =>
      m.createPostgresEquipeUnitOfWork(m.drizzle(client, { schema: { ...m.schema, ...m.equipeSchema } }) as never));

    const seeded = await m.free.seedWorkspace(h);
    workspaceIds.push(seeded.workspaceId);
    userIds.push(seeded.userId);
    const deps = m.free.depsFor(h);
    const opened = await m.executeCommand(deps, { actor: SYSTEM_OPEN, workspaceId: seeded.workspaceId },
      { type: "open_free_account", payload: { userId: seeded.userId } });
    if (!opened.ok) throw new Error(`open_free_account failed: ${opened.error.code}`);
    const accountId = opened.value.accountId!;
    const scope = { workspaceId: seeded.workspaceId, accountId };
    const [person] = await deps.uow.repos.people.list(scope);
    if (!person) throw new Error("missing approver person");
    const actor = { kind: "client_person" as const, role: "approver" as const, personId: person.id };
    const ctx = { actor, workspaceId: seeded.workspaceId, accountId };
    const send = (uow: Uow, note: string) =>
      m.executeCommand({ ...deps, uow }, ctx, { type: "request_support", payload: { note } } as never);
    return { h, deps, scope, uows, pids, send };
  }

  async function snapshot(f: Awaited<ReturnType<typeof setup>>) {
    const exceptions = (await f.deps.uow.repos.exceptions.list(f.scope)).filter((row) => row.trigger === "client_requested_person");
    const events = await f.deps.uow.repos.events.list(f.scope, {});
    const opened = events.filter((e) => e.eventType === "support_exception.opened");
    const notified = events.filter((e) => e.eventType === "notification.requested"
      && (e.payload as { templateKey?: string } | null)?.templateKey === "exception.opened");
    return { exceptions, opened, notified };
  }

  /** Pauses every request right after it listed the account's exceptions (its "is there an open one?" read). */
  function pauseAfterRead(uow: Uow, state: { reads: number }, proceed: Promise<void>): Uow {
    return {
      ...uow,
      run: (fn) => uow.run((repos, internal) => {
        const list = repos.exceptions.list.bind(repos.exceptions);
        const exceptions = {
          ...repos.exceptions,
          list: async (...args: Parameters<typeof list>) => {
            const rows = await list(...args);
            state.reads += 1;
            await proceed;
            return rows;
          },
        };
        return fn({ ...repos, exceptions }, internal);
      }),
    };
  }

  async function blockedBy(f: Awaited<ReturnType<typeof setup>>, pid: number, other: number) {
    const r = await f.h.db.execute(sql`select count(*)::int as n from pg_stat_activity
      where pid = ${pid} and wait_event_type = 'Lock' and ${other} = any(pg_blocking_pids(pid))`);
    return (r.rows[0] as { n: number }).n > 0;
  }

  it("two simultaneous person requests with the plan note: the same exception, 1 opened event, 1 notification intent", async () => {
    const f = await setup();
    const state = { reads: 0 };
    const release = m.free.deferred();
    const [uowA, uowB] = f.uows.map((u) => pauseAfterRead(u, state, release.promise)) as [Uow, Uow];

    const calls = Promise.all([f.send(uowA, m.note), f.send(uowB, m.note)]);
    // Barrier: both read "none open" (nothing serialized them), or one read and the other waits on a lock it holds.
    await m.free.waitUntil(async () => {
      if (state.reads >= 2) return true;
      return state.reads === 1 && (await blockedBy(f, f.pids[0]!, f.pids[1]!) || await blockedBy(f, f.pids[1]!, f.pids[0]!));
    }, "both requests read, or the second waits on the account lock");
    release.resolve();
    const [first, second] = await calls;

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.data.exceptionId).toBe(first.value.data.exceptionId);
    const after = await snapshot(f);
    const mine = after.exceptions.filter((row) => row.reason === m.note && row.status !== "closed");
    expect(mine.map((row) => row.id)).toEqual([first.value.data.exceptionId]);
    expect(after.opened.filter((e) => e.objectId === first.value.data.exceptionId)).toHaveLength(1);
    expect(after.opened).toHaveLength(1);
    expect(after.notified).toHaveLength(1);
  }, 60_000);

  it("simultaneous person requests with DIFFERENT notes stay separate: 2 exceptions", async () => {
    const f = await setup();

    const [first, second] = await Promise.all([f.send(f.uows[0]!, "Nota A do cliente"), f.send(f.uows[1]!, "Nota B do cliente")]);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.data.exceptionId).not.toBe(first.value.data.exceptionId);
    const after = await snapshot(f);
    expect(after.exceptions.map((row) => row.reason).sort()).toEqual(["Nota A do cliente", "Nota B do cliente"]);
    expect(after.opened).toHaveLength(2);
    expect(after.notified).toHaveLength(2);
  }, 60_000);

  it("a person request after the first one was closed opens a NEW exception", async () => {
    const f = await setup();
    const first = await f.send(f.uows[0]!, m.note);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await f.deps.uow.repos.exceptions.update(f.scope, first.value.data.exceptionId as string, { status: "closed" });

    const second = await f.send(f.uows[1]!, m.note);

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data.exceptionId).not.toBe(first.value.data.exceptionId);
    const after = await snapshot(f);
    expect(after.exceptions.filter((row) => row.status !== "closed").map((row) => row.id)).toEqual([second.value.data.exceptionId]);
    expect(after.exceptions).toHaveLength(2);
    expect(after.opened).toHaveLength(2);
  }, 60_000);
});
