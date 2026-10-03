/**
 * The staff pipeline and the job sweeps against REAL Postgres with thousands of free accounts (ticket 11): the number
 * of queries is fixed whatever the number of sign-ups, the free accounts with nothing open never show up, and the
 * indexes of migration 0134 exist with the predicates the planner needs.
 *
 * Everything runs inside ONE outer transaction rolled back at the end (see ./testing/staff-scale): the database is
 * shared and other suites have committed rows, so assertions are about the accounts created here (filtered by id),
 * never about totals. What decides a test is the number of statements and the result, never the speed of the machine:
 * the only time limit is the 30 s net of `WALL_CLOCK_GUARD_MS` (see ./testing/staff-scale for why).
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/equipe/module/staff-scale.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, scale, queries, jobs, gate, domain] = await Promise.all([
    import("./testing/free-pg"), import("./testing/staff-scale"), import("./escalation-queries"),
    import("../jobs/shared"), import("./equipe-enabled"), import("../domain"),
  ]);
  return { free, scale, queries, jobs, gate, domain };
}

const IDLE_FREE = 5_000;
// Seeding thousands of rows on a shared, loaded database: vitest's own 5 s test / 10 s hook limits are wall-clock
// ceilings too, so every test and hook of this file states a generous one.
const TIMEOUT_MS = 120_000;
const GATE = { enabledRaw: "true", allowlistRaw: "*" } as const;

describe.skipIf(!ENABLED)("staff pipeline and sweeps at scale (pg, one rolled-back transaction)", () => {
  let m: Mods;
  let counting: ReturnType<Mods["scale"]["openCountingDb"]>;
  let held: ReturnType<Mods["scale"]["heldRolledBackTransaction"]>;
  let tx: Awaited<ReturnType<ReturnType<Mods["scale"]["heldRolledBackTransaction"]>["open"]>>;
  let fixture: Awaited<ReturnType<Mods["scale"]["seedScaleFixture"]>>;

  beforeAll(async () => {
    m = await load();
    const assertTestDatabase: (url: string | null) => void = m.free.assertTestDatabase;
    assertTestDatabase(TEST_DATABASE_URL);
    counting = m.scale.openCountingDb(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(counting, TEST_DATABASE_URL!);
    // One seed for the whole file, in a transaction that is rolled back in afterAll.
    held = m.scale.heldRolledBackTransaction(counting);
    tx = await held.open();
    fixture = await m.scale.seedScaleFixture(tx, IDLE_FREE);
  }, TIMEOUT_MS);
  afterAll(async () => {
    if (!ENABLED) return;
    await held?.finish();
    await counting.pool.end();
  }, TIMEOUT_MS);

  it("the pipeline reads a fixed 5 queries and lists only paid accounts and free ones with something open", async () => {
    {
      const uow = m.scale.uowOf(tx);
      const mine = new Set([
        ...fixture.idleFree.map((a) => a.id), ...Object.values(fixture.paid).map((a) => a.id),
        ...Object.values(fixture.openFree).map((a) => a.id), ...Object.values(fixture.doneFree).map((a) => a.id),
      ]);

      const first = await m.scale.measured(counting, () => m.queries.getCrossAccountPipeline(uow.internal));
      expect(first.queries).toBe(5);
      expect(first.ms).toBeLessThan(m.scale.WALL_CLOCK_GUARD_MS);
      const entries = first.value.entries.filter((entry) => mine.has(entry.scope.accountId));
      const { paid, openFree } = fixture;
      expect(entries.map((entry) => entry.scope.accountId)).toEqual([
        paid.deploying.id, paid.active.id, paid.suspended.id, paid.closed.id,
        openFree.exception.id, openFree.claimed.id, openFree.escalation.id,
      ]);
      const byId = new Map(entries.map((entry) => [entry.scope.accountId, entry]));
      expect(byId.get(paid.active.id)).toMatchObject({
        scope: { workspaceId: paid.active.workspaceId, accountId: paid.active.id },
        brandName: expect.stringMatching(/^Marca Workspace s11 /),
        workspaceName: expect.stringMatching(/^Workspace s11 /),
        mandate: { approved: { version: 1, shadow: true }, activationPending: null },
      });
      expect(byId.get(paid.active.id)?.escalations.map((row) => row.status)).toEqual(["awaiting_client"]);
      expect(byId.get(paid.active.id)?.pauses.map((row) => row.status)).toEqual(["active"]);
      expect(byId.get(paid.deploying.id)).toMatchObject({ escalations: [], exceptions: [], pauses: [] });
      expect(byId.get(paid.closed.id)).toBeDefined();
      expect(byId.get(openFree.exception.id)?.exceptions.map((row) => row.status)).toEqual(["open"]);
      expect(byId.get(openFree.claimed.id)?.exceptions.map((row) => row.status)).toEqual(["claimed"]);
      expect(byId.get(openFree.escalation.id)?.escalations.map((row) => row.status)).toEqual(["open"]);
      for (const absent of [...fixture.idleFree, ...Object.values(fixture.doneFree)]) {
        expect(byId.has(absent.id)).toBe(false);
      }
      // No open row of a finished kind leaks into any entry.
      for (const entry of entries) {
        expect(entry.exceptions.every((row) => row.status === "open" || row.status === "claimed")).toBe(true);
        expect(entry.escalations.every((row) => ["open", "acknowledged", "resolving", "awaiting_client"].includes(row.status))).toBe(true);
        expect(entry.pauses.every((row) => row.status === "active")).toBe(true);
      }

      // 1,000 more sign-ups: the read costs the same.
      await m.scale.seedAccounts(tx, 1_000, "free");
      const second = await m.scale.measured(counting, () => m.queries.getCrossAccountPipeline(uow.internal));
      expect(second.queries).toBe(5);
      expect(second.ms).toBeLessThan(m.scale.WALL_CLOCK_GUARD_MS);
      expect(second.value.entries.filter((entry) => mine.has(entry.scope.accountId)).map((entry) => entry.scope.accountId))
        .toEqual(entries.map((entry) => entry.scope.accountId));
    }
  }, TIMEOUT_MS);

  it("labels one account with one query and one row, whatever the number of accounts", async () => {
    {
      const uow = m.scale.uowOf(tx);
      const target = fixture.paid.active;
      const read = await m.scale.measured(counting, () => uow.internal.listAccountLabels({ accountIds: [target.id] }));
      expect(read.queries).toBe(1);
      expect(read.value).toHaveLength(1);
      expect(read.value[0]).toMatchObject({ accountId: target.id, workspaceId: target.workspaceId });
      expect(read.value[0]?.brandName).toMatch(/^Marca Workspace s11 /);
      expect(read.ms).toBeLessThan(m.scale.WALL_CLOCK_GUARD_MS);
    }
  }, TIMEOUT_MS);

  it("the paid sweep costs one query per paid status and the free-notification sweep one query, not one per free account", async () => {
    {
      const uow = m.scale.uowOf(tx);
      const deps = {
        uow, clock: m.domain.fixedClock(new Date("2026-10-15T15:00:00.000Z")),
        isEnabledForWorkspace: (id: string) => m.gate.isEquipeEnabledForWorkspace(id, GATE),
        gatewayFor: () => undefined as never,
      };
      const idle = new Set(fixture.idleFree.map((a) => a.id));
      const paidIds = [fixture.paid.deploying.id, fixture.paid.active.id, fixture.paid.suspended.id];

      const paid = await m.scale.measured(counting, () => m.jobs.listEnabledAccounts(deps));
      expect(paid.queries).toBe(5);
      expect(paid.ms).toBeLessThan(m.scale.WALL_CLOCK_GUARD_MS);
      expect(paid.value.filter((a) => paidIds.includes(a.accountId)).map((a) => a.accountId).sort()).toEqual([...paidIds].sort());
      expect(paid.value.some((a) => a.accountId === fixture.paid.closed.id)).toBe(false);
      expect(paid.value.some((a) => idle.has(a.accountId))).toBe(false);
      expect(paid.value.every((a) => a.status !== "free" && a.status !== "closed")).toBe(true);

      const pending = await m.scale.measured(counting, () => uow.internal.listFreeAccountsWithPendingNotifications());
      expect(pending.queries).toBe(1);
      expect(pending.ms).toBeLessThan(m.scale.WALL_CLOCK_GUARD_MS);
      expect(pending.value.filter((a) => idle.has(a.id)).map((a) => a.id).sort())
        .toEqual(fixture.pendingNotificationFree.map((a) => a.id).sort());
      expect(pending.value.every((a) => a.status === "free")).toBe(true);
    }
  }, TIMEOUT_MS);

  it("migration 0134 left the five indexes, the partial ones with the predicates the queries rely on", async () => {
    const rows = (await counting.db.execute(sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'adscale_equipe' and indexname in (
        'equipe_accounts_status_idx', 'equipe_escalations_open_idx', 'equipe_exceptions_open_idx',
        'equipe_pauses_active_idx', 'equipe_events_notification_idx')`)).rows as Array<{ indexname: string; indexdef: string }>;
    const def = (name: string) => rows.find((row) => row.indexname === name)?.indexdef ?? "";
    expect(rows.map((row) => row.indexname).sort()).toEqual([
      "equipe_accounts_status_idx", "equipe_escalations_open_idx", "equipe_events_notification_idx",
      "equipe_exceptions_open_idx", "equipe_pauses_active_idx",
    ]);
    expect(def("equipe_accounts_status_idx")).toMatch(/\(status, created_at, id\)/);
    expect(def("equipe_accounts_status_idx")).not.toContain("WHERE");
    expect(def("equipe_escalations_open_idx")).toMatch(/\(account_id\)/);
    expect(def("equipe_escalations_open_idx")).toMatch(/WHERE [\s\S]*status[\s\S]*(open|ANY)/);
    for (const literal of ["open", "acknowledged", "resolving", "awaiting_client"]) expect(def("equipe_escalations_open_idx")).toContain(`'${literal}'`);
    expect(def("equipe_exceptions_open_idx")).toMatch(/WHERE/);
    for (const literal of ["open", "claimed"]) expect(def("equipe_exceptions_open_idx")).toContain(`'${literal}'`);
    expect(def("equipe_pauses_active_idx")).toMatch(/WHERE [\s\S]*status[\s\S]*'active'/);
    expect(def("equipe_events_notification_idx")).toMatch(/\(account_id, occurred_at\)/);
    expect(def("equipe_events_notification_idx")).toMatch(/WHERE [\s\S]*event_type[\s\S]*'notification\.requested'/);
  }, TIMEOUT_MS);
});
