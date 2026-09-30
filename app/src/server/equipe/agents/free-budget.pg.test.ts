/**
 * Teto grátis vitalício contra Postgres REAL: DOIS pools independentes (dois
 * "processos"), lock de sessão por conta, reserva commitada ANTES da rede,
 * settle antes de liberar, ausência de retry e reconciliação de órfãos.
 * Barreiras determinísticas (pg_locks / promessas), sem sleep como prova.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:55433/fluxo0_ticket01_test npm test -- src/server/equipe/agents/free-budget.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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

describe.skipIf(!ENABLED)("free budget (pg, dois pools)", () => {
  let m: Mods; let A: Pool; let B: Pool; let C: Pool; // C = observador independente
  const workspaces: string[] = []; const users: string[] = [];

  beforeAll(async () => {
    m = await load();
    [A, B, C] = [m.free.openPool(TEST_DATABASE_URL!), m.free.openPool(TEST_DATABASE_URL!), m.free.openPool(TEST_DATABASE_URL!)];
    for (const p of [A, B, C]) await m.free.assertEffectiveDatabase(p, TEST_DATABASE_URL!);
    process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS = "0";
  });
  afterAll(async () => {
    if (!ENABLED) return;
    delete process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS;
    await m.free.cleanup(A, workspaces, users);
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
    m.runner.createEquipeAgents({ moduleDeps: m.free.depsFor(p, now), client, ledger: new m.ledger.DrizzleLedgerStore(p.db as never), now: () => now });
  const strategist = (a: { workspaceId: string; accountId: string }) => ({ kind: "strategist_turn", ...a, input: { message: "Oi" } });
  const ledgerRows = (p: Pool, a: { accountId: string }) =>
    p.db.select().from(m.equipeSchema.equipeAgentLedger).where(eq(m.equipeSchema.equipeAgentLedger.accountId, a.accountId));
  const total = async (a: { workspaceId: string; accountId: string }) =>
    new m.ledger.DrizzleLedgerStore(C.db as never).lifetimeTotalCostUsdCents(a.workspaceId, a.accountId);
  const insertSpend = (a: { workspaceId: string; accountId: string }, cents: number, createdAt: Date) =>
    A.db.insert(m.equipeSchema.equipeAgentLedger).values({ ...a, role: "research", model: "muse-spark-1.3-contributor",
      promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0, costUsdCents: cents, createdAt });

  describe("withAccountLock", () => {
    it("blocks a second pool on the same account until the first releases; other accounts are unaffected", async () => {
      const a = await freeAccount(); const b = await freeAccount();
      const storeA = new m.ledger.DrizzleLedgerStore(A.db as never); const storeB = new m.ledger.DrizzleLedgerStore(B.db as never);
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
      const store = new m.ledger.DrizzleLedgerStore(A.db as never);
      await expect(store.withAccountLock(a, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
      expect(await m.free.holdingAdvisoryKey(C, scopeKey(a))).toBe(0);
      await expect(new m.ledger.DrizzleLedgerStore(B.db as never).withAccountLock(a, async () => "ok")).resolves.toBe("ok");
    });

    it("commits each ledger write immediately: a reservation is visible to another pool while the lock is still held", async () => {
      const a = await freeAccount();
      const store = new m.ledger.DrizzleLedgerStore(A.db as never);
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
      const clientFor = (label: string): EquipeModelClient => ({ async chat() {
        inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
        if (label === "second") unsettledAtSecondReserve = (await ledgerRows(C, a)).filter((r) => !r.settledAt).length;
        await new Promise<void>((r) => gates.push(r));
        inFlight -= 1;
        return { content: "ok", toolCalls: [], stopReason: "stop", usage: usage() };
      } });
      const p1 = agentsOn(A, clientFor("first")).runTask(strategist(a));
      await m.free.waitUntil(async () => gates.length === 1, "first in provider");
      const p2 = agentsOn(B, clientFor("second")).runTask(strategist(a));
      await m.free.waitUntil(async () => (await m.free.waitingOnAdvisoryKey(C, scopeKey(a))) === 1, "second blocked on lock");
      expect(await ledgerRows(C, a)).toHaveLength(1);   // second has not reserved
      gates.shift()!();
      await m.free.waitUntil(async () => gates.length === 1, "second in provider");
      expect(unsettledAtSecondReserve).toBe(1);          // only ITS own reservation is open
      gates.shift()!();
      expect((await Promise.all([p1, p2])).every((r) => r.ok)).toBe(true);
      expect(maxInFlight).toBe(1);
    });

    it("never exceeds the US$ 1 lifetime cap with 40 concurrent strategist calls across two pools", async () => {
      const a = await freeAccount();
      let inFlight = 0; let maxInFlight = 0; let calls = 0;
      const client: EquipeModelClient = { async chat() {
        calls += 1; inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return { content: "ok", toolCalls: [], stopReason: "stop", usage: usage() };
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
      expect(t).toBe(ok * 8);                              // each settled at the actual 8c
      expect((await ledgerRows(C, a)).every((r) => r.settledAt)).toBe(true);
    });

    it("stops a strategist tool loop mid-turn at the cap (iterations)", async () => {
      const a = await freeAccount();
      await insertSpend(a, 60, NOW);
      const requests: ModelCallRequest[] = [];
      const client: EquipeModelClient = { async chat(r) { requests.push(r);
        return { content: null, toolCalls: [{ id: "c", name: "get_goals", argumentsJson: "{}" }], stopReason: "tool_calls", usage: usage() } as ModelCallResponse; } };
      const out = await agentsOn(A, client).runTask({ ...strategist(a), input: { message: "loop", maxIterations: 10 } });
      expect(out).toEqual({ ok: false, error: m.runner.BUDGET_EXCEEDED_ERROR });
      expect(requests).toHaveLength(4);
      expect(await total(a)).toBe(92);
    });

    it("counts lifetime spend (an old month still consumes the cap)", async () => {
      const a = await freeAccount();
      await insertSpend(a, 99, new Date("2025-01-01T00:00:00Z"));
      let called = 0;
      const client: EquipeModelClient = { async chat() { called += 1; throw new Error("never"); } };
      expect(await agentsOn(A, client).runTask(strategist(a))).toEqual({ ok: false, error: m.runner.BUDGET_EXCEEDED_ERROR });
      expect(called).toBe(0);
    });

    it("the diagnostic reserve blocks free chat and diagnostic.recorded releases it", async () => {
      delete process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS;
      try {
        const a = await freeAccount();
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
      const store = new m.ledger.DrizzleLedgerStore(B.db as never);
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
      const store = new m.ledger.DrizzleLedgerStore(A.db as never);
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
