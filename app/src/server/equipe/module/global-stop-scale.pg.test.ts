/**
 * The global stop against REAL Postgres with thousands of free accounts (ticket 11): the stop and the resume read and
 * write only the paid accounts, so the cost follows the paid accounts, not the sign-ups. The old loop read every
 * non-closed account (items, an event and two notice requests each): more than 25,000 queries with 5,000 accounts.
 *
 * Everything runs inside ONE outer transaction rolled back at the end: the global stop is a single platform-wide row
 * that the repository contract requires inactive, so it must never be committed here. Assertions are about the
 * accounts created here (filtered by id), never about totals.
 *
 *   TEST_DATABASE_URL=postgres://jhonatan@localhost:5432/fluxo0_ticket11_test npm test -- src/server/equipe/module/global-stop-scale.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, scale, commands] = await Promise.all([
    import("./testing/free-pg"), import("./testing/staff-scale"), import("./commands"),
  ]);
  return { free, scale, commands };
}

const IDLE_FREE = 5_000;
const NOW = new Date("2026-10-15T15:00:00.000Z");

describe.skipIf(!ENABLED)("global stop at scale (pg, one rolled-back transaction)", () => {
  let m: Mods;
  let counting: ReturnType<Mods["scale"]["openCountingDb"]>;

  beforeAll(async () => {
    m = await load();
    const assertTestDatabase: (url: string | null) => void = m.free.assertTestDatabase;
    assertTestDatabase(TEST_DATABASE_URL);
    counting = m.scale.openCountingDb(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(counting, TEST_DATABASE_URL!);
    await waitForNoCommittedStop(5_000);
  });
  afterAll(async () => {
    if (ENABLED) await counting.pool.end();
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * A committed active stop would make `stop_all_publications` refuse. The repository contract of another file creates
   * and lifts one within a few milliseconds while files run in parallel, so wait it out; a stop that never clears is
   * left by a suite that crashed: say so plainly.
   */
  async function waitForNoCommittedStop(timeoutMs: number) {
    const internal = m.scale.uowOf(counting.db as never).internal;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const row = await internal.globalStops.getActive();
      if (!row) return;
      if (Date.now() > deadline) {
        throw new Error(`a committed global stop is active (id ${row.id}, reason "${row.reason}"): another suite left it; lift it before running this file`);
      }
      await sleep(50);
    }
  }

  it("stops and resumes only the paid accounts, with cost independent of the 5,000 free ones, and persists nothing", async () => {
    let stopId = "";
    await m.scale.inRolledBackTransaction(counting, async (tx) => {
      const fixture = await m.scale.seedScaleFixture(tx, IDLE_FREE);
      const mineAll = new Set([
        ...fixture.idleFree.map((a) => a.id), ...Object.values(fixture.paid).map((a) => a.id),
        ...Object.values(fixture.openFree).map((a) => a.id), ...Object.values(fixture.doneFree).map((a) => a.id),
      ]);
      // Other suites keep committed paid accounts in this shared database, and their cleanup may delete them while the
      // stop writes. The stop therefore sees the real `listAccounts({ statuses })` result narrowed to the accounts
      // created here; what the real query returned is recorded, to prove it never returned one of our free/closed ones.
      const returned: Array<{ id: string; status: string }> = [];
      const narrow = (internal: ReturnType<typeof m.scale.uowOf>["internal"]) => ({
        ...internal,
        listAccounts: async (filter?: Parameters<typeof internal.listAccounts>[0]) => {
          const rows = await internal.listAccounts(filter);
          returned.push(...rows.filter((row) => mineAll.has(row.id)));
          return rows.filter((row) => mineAll.has(row.id));
        },
      });
      const real = m.scale.uowOf(tx);
      const uow = { repos: real.repos, internal: narrow(real.internal), run: (fn: Parameters<typeof real.run>[0]) => real.run((repos, internal) => fn(repos, narrow(internal))) } as typeof real;
      const operations = await uow.internal.staff.create({ role: "operations", displayName: "Ops s11", active: true });
      const actor = { kind: "staff", role: "operations", staffId: operations.id } as const;
      const base = { actor, workspaceId: fixture.paid.active.workspaceId };
      const deps = m.free.depsFor(counting, NOW, { uow });

      const mine = new Set([...fixture.idleFree, ...Object.values(fixture.openFree), ...Object.values(fixture.doneFree)].map((a) => a.id)); // free or done
      const paidIds = [fixture.paid.deploying.id, fixture.paid.active.id, fixture.paid.suspended.id];
      const trail = async (accountId: string, eventType: string) =>
        (await tx.execute(sql`select event_type, payload from adscale_equipe.equipe_events
          where account_id = ${accountId}::uuid and event_type = ${eventType}`)).rows as Array<{ event_type: string; payload: Record<string, unknown> }>;
      const notices = async (accountId: string, templatePrefix: string) =>
        (await trail(accountId, "notification.requested")).filter((row) => String(row.payload?.templateKey).startsWith(templatePrefix));

      // A refused attempt (the other file's stop is active for a few milliseconds) changes nothing: the command rolled back.
      let stopped = await m.scale.measured(counting, () =>
        m.commands.executeCommand(deps, base, { type: "stop_all_publications", payload: { reason: "queda geral" } }));
      for (let attempt = 0; attempt < 5 && !stopped.value.ok && stopped.value.error.code === "global_stop_already_active"; attempt += 1) {
        await sleep(100);
        stopped = await m.scale.measured(counting, () =>
          m.commands.executeCommand(deps, base, { type: "stop_all_publications", payload: { reason: "queda geral" } }));
      }
      if (!stopped.value.ok) throw new Error(`stop failed: ${stopped.value.error.code}`);
      expect(returned.map((row) => row.id).sort()).toEqual([...paidIds].sort());
      expect(stopped.queries).toBeLessThan(500);
      expect(stopped.ms).toBeLessThan(2_000);
      stopId = stopped.value.value.data.stopId as string;
      const stoppedAccounts = stopped.value.value.data.stoppedAccounts as string[];
      expect([...stoppedAccounts].sort()).toEqual([...paidIds].sort());
      expect(stoppedAccounts).not.toContain(fixture.paid.closed.id);
      expect(stoppedAccounts.some((id) => mine.has(id))).toBe(false);
      const held = stopped.value.value.data.heldByAccount as Record<string, string[]>;
      expect(Object.keys(held).some((id) => mine.has(id))).toBe(false);

      for (const id of paidIds) {
        expect(await trail(id, "global_stop.applied")).toHaveLength(1);
        expect((await notices(id, "global_stop.applied")).map((row) => row.payload.recipientRole).sort()).toEqual(["founder", "operations"]);
      }
      const freeEvents = (await tx.execute(sql`select count(*)::int as n from adscale_equipe.equipe_events
        where account_id = any(${sql.param([...mine])}::uuid[]) and event_type like 'global_stop.%'`)).rows[0] as { n: number };
      expect(freeEvents.n).toBe(0);
      const freeNotices = (await tx.execute(sql`select count(*)::int as n from adscale_equipe.equipe_events
        where account_id = any(${sql.param([...mine])}::uuid[]) and event_type = 'notification.requested'
          and payload->>'templateKey' like 'global_stop.%'`)).rows[0] as { n: number };
      expect(freeNotices.n).toBe(0);

      const resumed = await m.scale.measured(counting, () =>
        m.commands.executeCommand(deps, base, { type: "resume_all_publications", payload: { reason: "provedor voltou" } }));
      if (!resumed.value.ok) throw new Error(`resume failed: ${resumed.value.error.code}`);
      expect(resumed.queries).toBeLessThan(500);
      expect(resumed.ms).toBeLessThan(2_000);
      const resumedAccounts = resumed.value.value.data.resumedAccounts as string[];
      expect([...resumedAccounts].sort()).toEqual([...paidIds].sort());
      expect(resumedAccounts).not.toContain(fixture.paid.closed.id);
      expect(resumedAccounts.some((id) => mine.has(id))).toBe(false);
      for (const id of paidIds) {
        expect(await trail(id, "global_stop.lifted")).toHaveLength(1);
        expect((await notices(id, "global_stop.lifted")).map((row) => row.payload.recipientRole).sort()).toEqual(["founder", "operations"]);
      }
      const liftedOnFree = (await tx.execute(sql`select count(*)::int as n from adscale_equipe.equipe_events
        where account_id = any(${sql.param([...mine])}::uuid[]) and event_type like 'global_stop.%'`)).rows[0] as { n: number };
      expect(liftedOnFree.n).toBe(0);
    });

    // Rolled back: nothing of the stop, the accounts or the staff row persists.
    // (By id: the repository contract of another file may hold its own committed stop at this very moment.)
    expect(stopId).not.toBe("");
    const persisted = (await counting.db.execute(sql`select count(*)::int as n from adscale_equipe.equipe_global_stops where id = ${stopId}::uuid`)).rows[0] as { n: number };
    expect(persisted.n).toBe(0);
    const leftovers = (await counting.db.execute(sql`select count(*)::int as n from adscale_equipe.equipe_accounts a
      join adscale_app.workspaces w on w.id = a.workspace_id where w.name like 'Workspace s11 %'`)).rows[0] as { n: number };
    expect(leftovers.n).toBe(0);
  }, 120_000);
});
