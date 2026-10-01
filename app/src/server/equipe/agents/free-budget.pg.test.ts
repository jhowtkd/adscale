/**
 * Teto grátis vitalício contra Postgres REAL: DOIS pools independentes (dois
 * "processos"), lock de sessão por conta, reserva commitada ANTES da rede,
 * settle antes de liberar, ausência de retry e reconciliação de órfãos.
 * Barreiras determinísticas (pg_locks / promessas), sem sleep como prova.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:55433/fluxo0_ticket01_test npm test -- src/server/equipe/agents/free-budget.pg.test.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;
const NOW = new Date("2026-10-15T15:00:00.000Z");

async function load() {
  const [free, commands, ledger, runner, budget, schema, equipeSchema, testing] = await Promise.all([
    import("../module/testing/free-pg"), import("../module/commands"), import("./ledger"), import("./runner"),
    import("./free-budget"), import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("./testing"),
  ]);
  return { free, commands, ledger, runner, budget, schema, equipeSchema, testing };
}
type Mods = Awaited<ReturnType<typeof load>>;
type Pool = ReturnType<Mods["free"]["openPool"]>;
import type { EquipeModelClient, ModelCallRequest, ModelCallResponse } from "./model-client";

const usage = (over: Partial<ModelCallResponse["usage"]> = {}) =>
  ({ inputTokens: 8000, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0, ...over });
// Happy-path usage must fit the complete payload bound of this request.
const requestUsage = (request: ModelCallRequest) => usage({
  inputTokens: Math.min(8000, request.inputTokenBound!), outputTokens: request.maxTokens!,
});

describe.skipIf(!ENABLED)("free budget (pg, dois pools)", () => {
  let m: Mods; let A: Pool; let B: Pool; let C: Pool; // C = observador independente
  // Dedicated session-lock pools per "process" (A/B), ended in afterAll. The 2nd constructor
  // argument is the lock pool; C (read-only observer) never locks.
  const lockPools = new Map<Pool, import("pg").Pool>();
  const makeStore = (db: unknown, lockPool?: import("pg").Pool) => new m.ledger.DrizzleLedgerStore(db as never, lockPool);
  const storeOn = (p: Pool) => makeStore(p.db, lockPools.get(p));
  const workspaces: string[] = []; const users: string[] = [];

  beforeAll(async () => {
    m = await load();
    [A, B, C] = [m.free.openPool(TEST_DATABASE_URL!), m.free.openPool(TEST_DATABASE_URL!), m.free.openPool(TEST_DATABASE_URL!)];
    for (const p of [A, B, C]) await m.free.assertEffectiveDatabase(p, TEST_DATABASE_URL!);
    const { Pool: PgPool } = await import("pg");
    for (const p of [A, B]) lockPools.set(p, new PgPool({ connectionString: TEST_DATABASE_URL!, max: 10, application_name: "free_lock" }));
    process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS = "0";
  });
  afterAll(async () => {
    if (!ENABLED) return;
    delete process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS;
    await m.free.cleanup(A, workspaces, users);
    await Promise.all([...lockPools.values()].map((l) => l.end()));
    await Promise.all([A.pool.end(), B.pool.end(), C.pool.end()]);
  });

  async function freeAccount() {
    const seeded = await m.free.seedWorkspace(A);
    workspaces.push(seeded.workspaceId); users.push(seeded.userId);
    const out = await m.commands.executeCommand(m.free.depsFor(A), { actor: { kind: "system", job: "free" }, workspaceId: seeded.workspaceId },
      { type: "open_free_account", payload: { userId: seeded.userId } });
    if (!out.ok) throw new Error(out.error.code);
    return { workspaceId: seeded.workspaceId, accountId: out.value.accountId! };
  }
  const scopeKey = (s: { workspaceId: string; accountId: string }) => `equipe-free-ai:${s.workspaceId}:${s.accountId}`;
  const agentsOn = (p: Pool, client: EquipeModelClient, now = NOW) =>
    m.runner.createEquipeAgents({ moduleDeps: m.free.depsFor(p, now), client, ledger: storeOn(p), now: () => now });
  const strategist = (a: { workspaceId: string; accountId: string }) => ({ kind: "strategist_turn", ...a, input: { message: "Oi" } });
  const ledgerRows = (p: Pool, a: { accountId: string }) =>
    p.db.select().from(m.equipeSchema.equipeAgentLedger).where(eq(m.equipeSchema.equipeAgentLedger.accountId, a.accountId));
  const total = async (a: { workspaceId: string; accountId: string }) =>
    makeStore(C.db).lifetimeTotalCostUsdCents(a.workspaceId, a.accountId);
  const insertSpend = (a: { workspaceId: string; accountId: string }, cents: number, createdAt: Date) =>
    A.db.insert(m.equipeSchema.equipeAgentLedger).values({ ...a, role: "research", model: "muse-spark-1.3-contributor",
      promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0, costUsdCents: cents, createdAt });

  describe("withAccountLock", () => {
    it("blocks a second pool on the same account until the first releases; other accounts are unaffected", async () => {
      const a = await freeAccount(); const b = await freeAccount();
      const storeA = storeOn(A); const storeB = storeOn(B);
      const gate = m.free.deferred(); const entered: string[] = [];
      const first = storeA.withAccountLock(a, async () => { entered.push("A"); await gate.promise; });
      await m.free.waitUntil(async () => (await m.free.holdingAdvisoryKey(C, scopeKey(a))) === 1, "A holds lock");
      const second = storeB.withAccountLock(a, async () => { entered.push("B"); });
      await m.free.waitUntil(async () => (await m.free.waitingOnAdvisoryKey(C, scopeKey(a))) === 1, "B waiting");
      expect(entered).toEqual(["A"]);
      await storeB.withAccountLock(b, async () => { entered.push("other-account"); });
      expect(entered).toEqual(["A", "other-account"]);
      gate.resolve(); await Promise.all([first, second]);
      expect(entered).toEqual(["A", "other-account", "B"]);
      expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
    });

    it("releases the lock when the callback throws (no leaked session lock, connection reusable)", async () => {
      const a = await freeAccount();
      const store = storeOn(A);
      await expect(store.withAccountLock(a, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
      expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
      await expect(storeOn(B).withAccountLock(a, async () => "ok")).resolves.toBe("ok");
    });

    it("commits each ledger write immediately: a reservation is visible to another pool while the lock is still held", async () => {
      const a = await freeAccount();
      const store = storeOn(A);
      const gate = m.free.deferred();
      const run = store.withAccountLock(a, async (locked) => {
        await locked.record({ ...a, role: "research", model: "m", promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0,
          costUsdCents: 7, reservedCostUsdCents: 7, reservationExpiresAt: new Date(NOW.getTime() + 900_000) });
        await gate.promise;
      });
      await m.free.waitUntil(async () => (await ledgerRows(C, a)).length === 1, "reservation visible");
      expect((await ledgerRows(C, a))[0]).toMatchObject({ costUsdCents: 7, reservedCostUsdCents: 7, settledAt: null });
      expect(await total(a)).toBe(7);
      gate.resolve(); await run;
    });
  });

  describe("dedicated lock pool", () => {
    // Observability: backend pids + application_name holding the account advisory locks.
    async function lockHolders(keys: string[]) {
      const r = await C.db.execute(sql`select distinct l.pid as pid, a.application_name as app from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
        where l.locktype = 'advisory' and l.granted
          and ((l.classid::bigint << 32) | l.objid::bigint) in (select hashtextextended(k, 0) from unnest(${sql.param(keys)}::text[]) k)`);
      return (r.rows as { pid: number; app: string }[]).sort((x, y) => x.pid - y.pid);
    }

    /**
     * Blocked providers on a TINY app pool. `lockPool` undefined = the production DEFAULT
     * (lazy dedicated singleton); otherwise the injected pool. gate/runs live OUTSIDE try so
     * `finally` can always release providers and drain runs before ending pools.
     */
    async function blockedProvidersScenario(lockPool: import("pg").Pool | undefined) {
      const { Pool: PgPool } = await import("pg");
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const appPool = new PgPool({ connectionString: TEST_DATABASE_URL!, max: 2, application_name: "free_app", connectionTimeoutMillis: 3000 });
      const appPids = new Set<number>();
      appPool.on("connect", (c) => { const pid = (c as unknown as { processID?: number }).processID; if (pid) appPids.add(pid); });
      const appDb = drizzle(appPool, { schema: { ...m.schema, ...m.equipeSchema } });
      const ACCOUNTS = 4;                                             // > app pool size (2)
      const gate = m.free.deferred();
      let runs: Array<Promise<{ ok: boolean }>> = [];
      let entered = 0;
      try {
        const accounts = await Promise.all(Array.from({ length: ACCOUNTS }, () => freeAccount()));
        const client: EquipeModelClient = { async chat() {
          entered += 1; await gate.promise;
          return { content: "ok", toolCalls: [], stopReason: "stop", usage: usage({ inputTokens: 100, outputTokens: 10 }) };
        } };
        const agents = m.runner.createEquipeAgents({ moduleDeps: m.free.depsFor({ pool: appPool, db: appDb } as never, NOW),
          client, ledger: makeStore(appDb, lockPool), now: () => NOW });
        runs = accounts.map((a) => agents.runTask(strategist(a)));
        await m.free.waitUntil(async () => entered === ACCOUNTS, "all providers blocked");

        // Every account lock lives on its own session, NEVER on an app-pool connection.
        const holders = await lockHolders(accounts.map(scopeKey));
        expect(holders).toHaveLength(ACCOUNTS);
        expect(holders.some((h) => appPids.has(h.pid))).toBe(false);
        expect(holders.every((h) => h.app !== "free_app")).toBe(true);
        if (lockPool) {
          expect(holders.every((h) => h.app === "free_lock")).toBe(true);
          expect(lockPool.totalCount).toBeGreaterThanOrEqual(ACCOUNTS);
        }
        for (const a of accounts) expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(1);
        // The app pool is neither exhausted nor queued: a query completes NOW, with providers still stuck.
        expect(appPool.waitingCount).toBe(0);
        const probe = await Promise.race([
          appDb.execute(sql`select 1 as ok`).then(() => "done"),
          new Promise<string>((r) => setTimeout(() => r("starved"), 2000)),
        ]);
        expect(probe).toBe("done");
        expect(appPool.waitingCount).toBe(0);

        gate.resolve();
        const results = await Promise.all(runs);
        expect(results.every((r) => r.ok)).toBe(true);
        for (const a of accounts) {
          expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);            // released in finally
          const [row] = await ledgerRows(C, a);
          expect(row!.settledAt).toBeInstanceOf(Date);                                 // settle before unlock preserved
        }
        expect(await lockHolders(accounts.map(scopeKey))).toEqual([]);
      } finally {
        gate.resolve();                                   // never leave providers/locks stuck on a failed assertion
        await Promise.allSettled(runs);
        await appPool.end();
        if (lockPool) await lockPool.end();
      }
    }

    it("INJECTED lock pool: account locks stay outside a tiny app pool while providers are stuck", async () => {
      const { Pool: PgPool } = await import("pg");
      await blockedProvidersScenario(new PgPool({ connectionString: TEST_DATABASE_URL!, max: 10, application_name: "free_lock" }));
    });

    it("production DEFAULT (no injection, new DrizzleLedgerStore(db)) also uses a separate session pool", async () => {
      await blockedProvidersScenario(undefined);
    });

    it("keeps same-account serialization on the dedicated pool and releases the session lock after a failure", async () => {
      const a = await freeAccount();
      const gate = m.free.deferred(); const order: string[] = [];
      const client: EquipeModelClient = { async chat() {
        order.push("provider"); await gate.promise;
        return { content: "ok", toolCalls: [], stopReason: "stop", usage: usage({ inputTokens: 100, outputTokens: 10 }) };
      } };
      let runs: Array<Promise<{ ok: boolean }>> = [];
      try {
        const p1 = agentsOn(A, client).runTask(strategist(a));
        runs = [p1];
        await m.free.waitUntil(async () => order.length === 1, "first in provider");
        const p2 = agentsOn(B, client).runTask(strategist(a));
        runs = [p1, p2];
        await m.free.waitUntil(async () => (await m.free.waitingOnAdvisoryKey(C, scopeKey(a))) === 1, "second waits on the dedicated session lock");
        expect((await lockHolders([scopeKey(a)])).every((h) => h.app === "free_lock")).toBe(true);
        gate.resolve();
        expect((await Promise.all(runs)).every((r) => r.ok)).toBe(true);
        expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
        await expect(storeOn(A).withAccountLock(a, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
        expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
      } finally {
        gate.resolve();
        await Promise.allSettled(runs);
      }
    });
  });

  describe("listWorkspaceIds (real PG keyset page)", () => {
    it("honours limit, id ASC order and an exclusive cursor without assuming an empty database", async () => {
      const seeded = (await Promise.all([1, 2, 3].map(async () => {
        const w = await m.free.seedWorkspace(A); workspaces.push(w.workspaceId); users.push(w.userId); return w.workspaceId;
      }))).sort();
      const internal = m.free.depsFor(A).uow.internal;
      const asc = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1]! < id);

      const first = await internal.listWorkspaceIds({ limit: 2 });
      expect(first).toHaveLength(2);
      expect(asc(first)).toBe(true);

      const afterFirst = await internal.listWorkspaceIds({ after: first[0]!, limit: 2 });
      expect(afterFirst.length).toBeLessThanOrEqual(2);
      expect(afterFirst.every((id) => id > first[0]!)).toBe(true);      // cursor is exclusive
      expect(afterFirst).not.toContain(first[0]);
      expect(asc(afterFirst)).toBe(true);

      const beyondSeeded = await internal.listWorkspaceIds({ after: seeded[2]!, limit: 2 });
      expect(beyondSeeded.some((id) => seeded.includes(id))).toBe(false);
      expect(beyondSeeded.every((id) => id > seeded[2]!)).toBe(true);

      const tail = await internal.listWorkspaceIds({ after: seeded[0]!, limit: 100_000 });
      expect(asc(tail)).toBe(true);
      expect(tail).toEqual(expect.arrayContaining([seeded[1], seeded[2]]));
      expect(tail).not.toContain(seeded[0]);
    });
  });

  describe("runner with two pools", () => {
    it("reserves the maximum in a COMMITTED row before the network call, then settles before unlocking", async () => {
      const a = await freeAccount();
      let seen: Awaited<ReturnType<typeof ledgerRows>> = []; let heldDuringCall = 0; let request: ModelCallRequest | undefined;
      const client: EquipeModelClient = { async chat(r) {
        request = r;
        seen = await ledgerRows(C, a);                           // third, independent connection
        heldDuringCall = await m.free.holdingAdvisoryKey(C, scopeKey(a));
        return { content: "Oi", toolCalls: [], stopReason: "stop", usage: usage({ inputTokens: 100, outputTokens: 10 }) };
      } };
      expect((await agentsOn(A, client).runTask(strategist(a))).ok).toBe(true);
      expect(heldDuringCall).toBe(1);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ settledAt: null, inputTokens: 0 });
      expect(seen[0]!.reservedCostUsdCents).toBe(m.ledger.maximumCallCostUsdCents("claude-opus-5-5", request!.inputTokenBound!, request!.maxTokens!));
      expect(seen[0]!.reservationExpiresAt!.getTime()).toBe(NOW.getTime() + 15 * 60_000);
      expect(request!.noRetries).toBe(true);
      const [row] = await ledgerRows(C, a);
      expect(row).toMatchObject({ inputTokens: 100, outputTokens: 10, costUsdCents: 1 });
      expect(row!.settledAt).toBeInstanceOf(Date);
      expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
    });

    it("serializes calls from two pools: the 2nd reserves only after the 1st settled, never overlapping on the provider", async () => {
      const a = await freeAccount();
      let inFlight = 0; let maxInFlight = 0; const gates: Array<() => void> = []; let unsettledAtSecondReserve = -1;
      const clientFor = (label: string): EquipeModelClient => ({ async chat(request) {
        inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
        if (label === "second") unsettledAtSecondReserve = (await ledgerRows(C, a)).filter((r) => !r.settledAt).length;
        await new Promise<void>((r) => gates.push(r));
        inFlight -= 1;
        return { content: "ok", toolCalls: [], stopReason: "stop", usage: requestUsage(request) };
      } });
      const p1 = agentsOn(A, clientFor("first")).runTask(strategist(a));
      await m.free.waitUntil(async () => gates.length === 1, "first in provider");
      const p2 = agentsOn(B, clientFor("second")).runTask(strategist(a));
      await m.free.waitUntil(async () => (await m.free.waitingOnAdvisoryKey(C, scopeKey(a))) === 1, "second blocked on lock");
      expect(await ledgerRows(C, a)).toHaveLength(1);   // second has not reserved
      gates.shift()!();
      await m.free.waitUntil(async () => gates.length === 1, "second in provider");
      gates.shift()!();
      expect((await Promise.all([p1, p2])).every((r) => r.ok)).toBe(true);
      expect(unsettledAtSecondReserve).toBe(1);          // only ITS own reservation is open
      expect(maxInFlight).toBe(1);
    });

    it("never exceeds the US$ 1 lifetime cap with 40 concurrent strategist calls across two pools", async () => {
      const a = await freeAccount();
      let inFlight = 0; let maxInFlight = 0; let calls = 0; let expectedCost = 0;
      const client: EquipeModelClient = { async chat(request) {
        calls += 1; inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        const reported = requestUsage(request);
        expectedCost += m.ledger.estimateCostUsdCents(request.model, reported.inputTokens, reported.outputTokens);
        return { content: "ok", toolCalls: [], stopReason: "stop", usage: reported };
      } };
      const agentA = agentsOn(A, client); const agentB = agentsOn(B, client);
      const results = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? agentA : agentB).runTask(strategist(a))));
      const ok = results.filter((r) => r.ok).length;
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === m.runner.BUDGET_EXCEEDED_ERROR)).toBe(true);
      expect(ok).toBe(calls);
      expect(ok).toBeGreaterThan(0); expect(ok).toBeLessThan(40);
      expect(maxInFlight).toBe(1);
      const t = await total(a);
      expect(t).toBeLessThanOrEqual(100);
      expect(t).toBe(expectedCost);                        // each settled at its reported actual cost
      expect((await ledgerRows(C, a)).every((r) => r.settledAt)).toBe(true);
    });

    it("stops a strategist tool loop mid-turn at the cap (iterations)", async () => {
      const a = await freeAccount();
      await insertSpend(a, 60, NOW);
      const requests: ModelCallRequest[] = [];
      let expectedCost = 60;
      const client: EquipeModelClient = { async chat(r) { requests.push(r);
        const reported = requestUsage(r);
        expectedCost += m.ledger.estimateCostUsdCents(r.model, reported.inputTokens, reported.outputTokens);
        return { content: null, toolCalls: [{ id: `c${requests.length}`, name: "get_account_state", argumentsJson: "{}" }], stopReason: "tool_calls", usage: reported } as ModelCallResponse; } };
      const out = await agentsOn(A, client).runTask({ ...strategist(a), input: { message: "loop", maxIterations: 10 } });
      expect(out).toEqual({ ok: false, error: m.runner.BUDGET_EXCEEDED_ERROR });
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.length).toBeLessThan(10);
      expect(requests.every((r) => r.noRetries === true)).toBe(true);
      expect(await total(a)).toBe(expectedCost);
      expect(expectedCost).toBeLessThanOrEqual(100);
      const reservations = (await ledgerRows(C, a)).filter((r) => r.reservedCostUsdCents !== null);
      expect(reservations).toHaveLength(requests.length);
      expect(reservations.every((r) => r.settledAt)).toBe(true);
    });

    it("counts lifetime spend (an old month still consumes the cap)", async () => {
      const a = await freeAccount();
      await insertSpend(a, 99, new Date("2025-01-01T00:00:00Z"));
      let called = 0;
      const client: EquipeModelClient = { async chat() { called += 1; throw new Error("never"); } };
      expect(await agentsOn(A, client).runTask(strategist(a))).toEqual({ ok: false, error: m.runner.BUDGET_EXCEEDED_ERROR });
      expect(called).toBe(0);
    });

    it("the (default, 10-cent) diagnostic reserve blocks the free chat that would eat it and diagnostic.recorded releases it", async () => {
      delete process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS;
      try {
        const a = await freeAccount();
        await insertSpend(a, 85, NOW);   // 85 + 10 reserved + one strategist call at its maximum (9) > 100
        let called = 0;
        const client: EquipeModelClient = { async chat() { called += 1; return { content: "ok", toolCalls: [], stopReason: "stop", usage: usage({ inputTokens: 10, outputTokens: 10 }) }; } };
        const agents = agentsOn(A, client);
        expect(await agents.runTask(strategist(a))).toEqual({ ok: false, error: m.runner.BUDGET_EXCEEDED_ERROR });
        expect(called).toBe(0);
        // an unrelated event with a documentId does NOT release it
        await m.free.depsFor(A).uow.repos.events.create(a, { actorType: "system", actorId: "x", actorRole: "system", eventType: "diagnostic.other", payload: { documentId: "d" }, occurredAt: NOW });
        expect((await agents.runTask(strategist(a))).ok).toBe(false);
        await m.free.depsFor(A).uow.repos.events.create(a, { actorType: "system", actorId: "diag", actorRole: "system", eventType: m.budget.DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: crypto.randomUUID() }, occurredAt: NOW });
        expect((await agents.runTask(strategist(a))).ok).toBe(true);
        expect(called).toBe(1);
      } finally { process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS = "0"; }
    });

    it("a provider failure is a single attempt, keeps the reservation at maximum, and counts against the cap", async () => {
      const a = await freeAccount();
      let attempts = 0;
      const client: EquipeModelClient = { async chat() { attempts += 1; throw new Error("socket hang up"); } };
      expect(await agentsOn(A, client).runTask(strategist(a))).toEqual({ ok: false, error: "socket hang up" });
      expect(attempts).toBe(1);
      const [row] = await ledgerRows(C, a);
      expect(row!.settledAt).toBeNull();
      expect(row!.costUsdCents).toBe(row!.reservedCostUsdCents);
      expect(await total(a)).toBe(row!.reservedCostUsdCents);
      expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);   // lock released even on failure
    });

    it("a provider REFUSAL (HTTP 400) gives the whole reservation back, committed, and the reconciler leaves it at zero (ticket 13, D-2)", async () => {
      const a = await freeAccount();
      let attempts = 0;
      const refusal = Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "output_config.format.schema: property 'maxItems' is not supported" } },
        undefined, new Headers({ "request-id": "req_pg" }));
      const client: EquipeModelClient = { async chat() { attempts += 1; throw refusal; } };
      const out = await agentsOn(A, client).runTask(strategist(a));
      expect(out.ok).toBe(false);
      expect(attempts).toBe(1);
      const [row] = await ledgerRows(C, a);               // read from a third, independent connection: it is committed
      expect(row!.reservedCostUsdCents).toBeGreaterThan(0);
      expect(row).toMatchObject({ costUsdCents: 0, inputTokens: 0, outputTokens: 0 });
      expect(row!.settledAt).toBeInstanceOf(Date);
      expect(await total(a)).toBe(0);
      expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
      const events = await m.free.depsFor(A).uow.repos.events.list(a, { eventType: "agent.model_call_rejected" });
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toMatchObject({ kind: "provider_rejected", status: 400, errorType: "invalid_request_error", requestId: "req_pg", taskKind: "strategist_turn" });
      // Later, the orphan reconciler has nothing to close: the row was settled, and it stays at zero.
      await storeOn(B).settleExpiredReservations(new Date(NOW.getTime() + 16 * 60_000));
      expect((await ledgerRows(C, a))[0]).toMatchObject({ costUsdCents: 0, settledAt: row!.settledAt });
      expect(await total(a)).toBe(0);
    });

    it("an account is given back at most five reservations in Postgres: the sixth refusal keeps its maximum, counted from the ledger itself (review of PR 614)", async () => {
      const a = await freeAccount(); const other = await freeAccount();
      const refusal = () => Anthropic.APIError.generate(400, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: 99999999 is too large" } }, undefined, new Headers());
      const client: EquipeModelClient = { async chat() { throw refusal(); } };
      for (let attempt = 0; attempt < 7; attempt++) expect((await agentsOn(A, client).runTask(strategist(a))).ok).toBe(false);
      const rows = (await ledgerRows(C, a)).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || (x.id < y.id ? -1 : 1));
      expect(rows.filter((r) => r.costUsdCents === 0 && r.settledAt)).toHaveLength(5);
      expect(rows.filter((r) => r.costUsdCents > 0 && r.costUsdCents === r.reservedCostUsdCents && !r.settledAt)).toHaveLength(2);
      expect(await makeStore(C.db).countGivenBackReservations(a.workspaceId, a.accountId)).toBe(5);
      // Per account: the other one has none, and a settled success never counts.
      expect(await makeStore(C.db).countGivenBackReservations(other.workspaceId, other.accountId)).toBe(0);
      const ok: EquipeModelClient = { async chat(request) { return { content: "ok", toolCalls: [], stopReason: "stop", usage: requestUsage(request) }; } };
      expect((await agentsOn(A, ok).runTask(strategist(other))).ok).toBe(true);
      expect(await makeStore(C.db).countGivenBackReservations(other.workspaceId, other.accountId)).toBe(0);
      const events = await m.free.depsFor(A).uow.repos.events.list(a, { eventType: "agent.model_call_rejected" });
      expect(events.filter((e) => (e.payload as { reason?: string }).reason === "give_back_limit")).toHaveLength(2);
    });

    it("fraudulent or unknown usage fails without refund", async () => {
      for (const bad of [{ usageKnown: false as const, usage: usage({ inputTokens: 1, outputTokens: 1 }) }, { usage: usage({ inputTokens: 10_000_000 }) }, { usage: usage({ outputTokens: 999_999 }) }]) {
        const a = await freeAccount();
        const client: EquipeModelClient = { async chat() { return { content: "x", toolCalls: [], stopReason: "stop", ...bad } as ModelCallResponse; } };
        const out = await agentsOn(A, client).runTask(strategist(a));
        expect(out.ok).toBe(false);
        const [row] = await ledgerRows(C, a);
        expect(row!.settledAt).toBeNull();
        expect(row!.costUsdCents).toBe(row!.reservedCostUsdCents);
      }
    });

    it("orphan reservations settle at their MAXIMUM only after 15 minutes; fresh ones stay open", async () => {
      const a = await freeAccount(); const fresh = await freeAccount(); const withoutReservation = await freeAccount();
      const dead: EquipeModelClient = { async chat() { throw new Error("process killed"); } };
      await agentsOn(A, dead).runTask(strategist(a));
      await agentsOn(A, dead, new Date(NOW.getTime() + 14 * 60_000)).runTask(strategist(fresh));
      const store = storeOn(B);
      await store.record({ ...withoutReservation, role: "research", model: "m", promptVersion: "v", taskKind: "research",
        inputTokens: 0, outputTokens: 0, costUsdCents: 1, reservationExpiresAt: NOW });
      await store.settleExpiredReservations(new Date(NOW.getTime() + 15 * 60_000 - 1));
      expect((await ledgerRows(C, a))[0]!.settledAt).toBeNull();
      const at = new Date(NOW.getTime() + 15 * 60_000);
      await store.settleExpiredReservations(at);
      const [orphan] = await ledgerRows(C, a);
      expect(orphan!.settledAt).toEqual(at);
      expect(orphan!.costUsdCents).toBe(orphan!.reservedCostUsdCents);     // no refund
      expect(await total(a)).toBe(orphan!.reservedCostUsdCents);
      expect((await ledgerRows(C, fresh))[0]!.settledAt).toBeNull();        // reserved 14 min later, still open
      expect((await ledgerRows(C, withoutReservation))[0]!.settledAt).toBeNull();
      await store.settleExpiredReservations(at);                            // idempotent
      expect((await ledgerRows(C, a))[0]!.settledAt).toEqual(at);
    });

    it("settle is scoped, idempotent and bounded by the reservation", async () => {
      const a = await freeAccount(); const other = await freeAccount();
      const store = storeOn(A);
      const row = await store.record({ ...a, role: "research", model: "m", promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0,
        costUsdCents: 5, reservedCostUsdCents: 5, reservationExpiresAt: new Date(NOW.getTime() + 900_000) });
      const u = { model: "m", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
      await store.settle(other, row.id, u, 1, NOW);
      expect((await ledgerRows(C, a))[0]!.settledAt).toBeNull();
      await expect(store.settle(a, row.id, u, 6, NOW)).rejects.toThrow("free_call_bound_exceeded");
      await store.settle(a, row.id, u, 2, NOW);
      await store.settle(a, row.id, u, 4, new Date(NOW.getTime() + 1000));
      expect((await ledgerRows(C, a))[0]).toMatchObject({ costUsdCents: 2, settledAt: NOW });
    });

    it("free research goes through the same admission; paid-style writing is refused with requires_plan", async () => {
      const a = await freeAccount();
      const requests: ModelCallRequest[] = [];
      const client: EquipeModelClient = { async chat(r) { requests.push(r);
        return { content: JSON.stringify({ facts: [{ claim: "F", source: "S", section: null }], diagnosis: "ok" }), toolCalls: [], stopReason: "stop", usage: usage({ inputTokens: 100, outputTokens: 10 }) }; } };
      const agents = agentsOn(A, client);
      expect((await agents.runTask({ kind: "research", ...a, input: { materials: [{ assetId: "a", label: "S", excerpt: "t" }] } })).ok).toBe(true);
      expect(requests[0]).toMatchObject({ noRetries: true });
      expect(await agents.runTask({ kind: "writing", ...a, input: { workItemId: "w" } })).toEqual({ ok: false, error: "requires_plan" });
      expect(requests).toHaveLength(1);
    });
  });
});
