// One diagnosis reserve for the whole free account (ticket 13, D-7): the chat admission (free-budget.ts) and the reading flow (free-balance.ts) must
// never disagree about how much the account keeps for its diagnosis. Property test (fixed seed) over environments and ledger totals.

import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { createBudgetedModelClient } from "./budgeted-client";
import { diagnosisAttemptRequirementUsdCents, sourceCorrectionRequirementUsdCents, readingMaxAdmissionUsdCents } from "./free-balance";
import { DIAGNOSIS_MEASURED_RESERVE_USD_CENTS, DIAGNOSTIC_RECORDED_EVENT, diagnosticReserveUsdCents, freeBudgetUsdCents, modelInputTokenBound } from "./free-budget";
import { maximumCallCostUsdCents, MemoryLedgerStore } from "./ledger";
import { FakeModelClient } from "./testing";
import type { ModelCallRequest } from "./model-client";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const MODEL = "claude-opus-5-5";
const BUDGET = "EQUIPE_FREE_AI_BUDGET_USD_CENTS", RESERVE = "EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS";

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: number | undefined) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key]; else process.env[key] = String(value);
}
afterEach(() => { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } saved.clear(); });

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

describe("the diagnosis reserve is one number", () => {
  it("is the same in the chat admission and in the reading flow, never above the cap, for every cap and every configured reserve", () => {
    const r = rng(2026);
    const combos: Array<[number, number | undefined]> = [];
    for (let budget = 0; budget <= 100; budget += 5) for (const reserve of [undefined, ...Array.from({ length: 21 }, (_, i) => i * 5)]) combos.push([budget, reserve]);
    for (let i = 0; i < 300; i++) combos.push([int(r, 0, 100), r() < 0.3 ? undefined : int(r, 0, 100)]);
    for (const [budget, reserve] of combos) {
      setEnv(BUDGET, budget); setEnv(RESERVE, reserve);
      const chat = diagnosticReserveUsdCents(), flow = diagnosisAttemptRequirementUsdCents();
      expect(flow, `budget ${budget} reserve ${reserve}`).toBe(chat);
      expect(chat).toBeLessThanOrEqual(budget);
      expect(chat).toBeGreaterThanOrEqual(0);
      expect(chat).toBe(Math.min(budget, reserve ?? DIAGNOSIS_MEASURED_RESERVE_USD_CENTS));
      if (reserve === undefined) expect(chat).toBe(Math.min(budget, 10));
      expect(sourceCorrectionRequirementUsdCents()).toBe(chat + readingMaxAdmissionUsdCents());
    }
  });

  it("the unset default is 10 cents, not the whole cap", () => {
    setEnv(BUDGET, 100); setEnv(RESERVE, undefined);
    expect(DIAGNOSIS_MEASURED_RESERVE_USD_CENTS).toBe(10);
    expect(diagnosticReserveUsdCents()).toBe(10);
    expect(diagnosisAttemptRequirementUsdCents()).toBe(10);
    setEnv(BUDGET, 7);
    expect(diagnosticReserveUsdCents()).toBe(7);
  });
});

describe("the chat admission with reserveDiagnostic", () => {
  async function freeAccount() {
    const t = makeTestDeps({ now: NOW });
    const workspaceId = uuid(), userId = `user-${uuid()}`;
    t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, { type: "open_free_account", payload: { userId } });
    if (!opened.ok) throw new Error(opened.error.code);
    return { t, scope: { workspaceId, accountId: opened.value.accountId! } };
  }

  it("refuses a Strategist call iff total + reserve + maximum is above the cap, and the reserve is 0 once a diagnostic is recorded (300 random cases)", async () => {
    const r = rng(77);
    let refused = 0, admitted = 0, afterRecord = 0;
    for (let i = 0; i < 300; i++) {
      const budget = int(r, 0, 100), reserve = r() < 0.3 ? undefined : int(r, 0, 100);
      setEnv(BUDGET, budget); setEnv(RESERVE, reserve);
      const a = await freeAccount();
      const ledger = new MemoryLedgerStore();
      const total = int(r, 0, budget);
      if (total) await ledger.record({ ...a.scope, role: "research", model: "m", promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0, costUsdCents: total });
      const base: ModelCallRequest = { model: MODEL, messages: [{ role: "user", content: "x".repeat(int(r, 1, 4000)) }], maxTokens: int(r, 100, 2048) };
      const request = { ...base, inputTokenBound: modelInputTokenBound(base)! };
      const maximum = maximumCallCostUsdCents(MODEL, request.inputTokenBound, request.maxTokens!)!;
      const model = new FakeModelClient([{ content: "ok" }, { content: "ok" }]);
      const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: () => model, free: true, model: MODEL, role: "strategist",
        taskKind: "strategist_turn", now: () => NOW, reserveDiagnostic: true });
      const reserved = diagnosticReserveUsdCents();
      const refusedNow = total + reserved + maximum > freeBudgetUsdCents();
      const outcome = await client.chat(request).then(() => "ok", (e: Error) => e.message);
      if (refusedNow) {
        expect(outcome, `budget ${budget} reserve ${reserve} total ${total} max ${maximum}`).toBe("budget_exceeded");
        expect(model.requests).toHaveLength(0);
        refused++;
      } else { expect(outcome).toBe("ok"); admitted++; }
      // After the diagnostic is recorded the reserve is gone: only total + maximum counts.
      await a.t.deps.uow.repos.events.create(a.scope, { actorType: "system", actorId: "diag", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: uuid() } as never, occurredAt: NOW });
      const spent = await ledger.lifetimeTotalCostUsdCents(a.scope.workspaceId, a.scope.accountId);
      const again = await client.chat(request).then(() => "ok", (e: Error) => e.message);
      expect(again, `after record: budget ${budget} spent ${spent} max ${maximum}`).toBe(spent + maximum > freeBudgetUsdCents() ? "budget_exceeded" : "ok");
      afterRecord++;
    }
    expect(refused).toBeGreaterThan(30);
    expect(admitted).toBeGreaterThan(30);
    expect(afterRecord).toBe(300);
  }, 60_000);
});
