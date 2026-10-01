// Property test (fixed seed) for the free account's US$ 1 cap (ticket 13, D-2): random sequences of calls through the budgeted client and the
// in-memory ledger, with the orphan reconciler running at random instants. Whatever the order, the books must add up and a doubt is never refunded.

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { createBudgetedModelClient } from "./budgeted-client";
import { modelInputTokenBound } from "./free-budget";
import { estimateCostUsdCents, maximumCallCostUsdCents, MemoryLedgerStore } from "./ledger";
import { ModelRequestNotSentError, type EquipeModelClient, type ModelCallRequest, type ModelCallResponse } from "./model-client";

const MODEL = "claude-opus-5-5";
const CAP = 100;
const START = new Date("2026-10-15T15:00:00.000Z").getTime();

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const apiError = (status: number) => Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message: "m" }, request_id: "r" }, `${status} m`, new Headers());
type Outcome = "success" | "refused" | "doubt" | "unknown_usage" | "over_bound" | "abort_before_send" | "not_sent";
const OUTCOMES: Outcome[] = ["success", "success", "success", "refused", "doubt", "doubt", "unknown_usage", "over_bound", "abort_before_send", "not_sent"];
const DOUBTS = [() => apiError(503), () => apiError(429), () => apiError(408), () => new Anthropic.APIConnectionError({ message: "hang up" }), () => new Anthropic.APIConnectionTimeoutError(),
  () => new Anthropic.APIUserAbortError(), () => new Error("provider_down"), () => "boom"];
const REFUSALS = [400, 401, 403, 404, 413, 422];

async function freeAccount() {
  const t = makeTestDeps({ now: new Date(START) });
  const workspaceId = uuid(), userId = `u-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true, role: "owner", createdAt: new Date("2026-01-01T00:00:00.000Z") });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  return { t, scope: { workspaceId, accountId: opened.value.accountId! } };
}

const snapshot = (ledger: MemoryLedgerStore) => ledger.entries.map(e => ({ id: e.id, cost: e.costUsdCents, reserved: e.reservedCostUsdCents, settledAt: e.settledAt?.getTime() ?? null,
  tokens: [e.inputTokens, e.outputTokens, e.cacheReadTokens, e.cacheWriteTokens] }));

async function runSequence(seed: number, steps: number) {
  const r = rng(seed);
  const { t, scope } = await freeAccount();
  const ledger = new MemoryLedgerStore();
  let clock = START;
  const provider = vi.fn<(request: ModelCallRequest) => Promise<ModelCallResponse>>();
  let expectedTotal = 0;
  const refusedByCap: number[] = [];
  for (let step = 0; step < steps; step++) {
    clock += int(r, 0, 9 * 60_000);
    const before = snapshot(ledger);
    if (r() < 0.2) {
      // The reconciler, at a random instant (before or after the reservations expire): it only ever closes a row, at the cost it already carries.
      const at = new Date(clock + int(r, 0, 20 * 60_000));
      await ledger.settleExpiredReservations(at);
      const after = snapshot(ledger);
      for (const [i, row] of after.entries()) {
        const was = before[i]!;
        expect(row.cost).toBe(was.cost);
        if (was.settledAt !== null) expect(row).toEqual(was); // A settled row never changes.
        else if (row.settledAt !== null) {
          expect(row.settledAt).toBe(at.getTime());
          expect(ledger.entries[i]!.reservationExpiresAt!.getTime()).toBeLessThanOrEqual(at.getTime());
        } else expect(ledger.entries[i]!.reservationExpiresAt!.getTime()).toBeGreaterThan(at.getTime());
      }
      await ledger.settleExpiredReservations(at); // Idempotent.
      expect(snapshot(ledger)).toEqual(after);
    } else {
      const outcome = OUTCOMES[int(r, 0, OUTCOMES.length - 1)]!;
      const base: ModelCallRequest = { model: MODEL, messages: [{ role: "user", content: "x".repeat(int(r, 1, 3000)) }], maxTokens: int(r, 200, 2048) };
      const request = { ...base, inputTokenBound: modelInputTokenBound(base)! };
      const maximum = maximumCallCostUsdCents(MODEL, request.inputTokenBound, request.maxTokens!)!;
      const usage = { inputTokens: int(r, 0, request.inputTokenBound), outputTokens: int(r, 0, request.maxTokens!), cacheReadTokens: 0, cacheWriteTokens: 0 };
      provider.mockReset();
      let chosen: EquipeModelClient;
      let expectedCost: number | "max";
      switch (outcome) {
        case "success": provider.mockResolvedValue({ content: "ok", toolCalls: [], usage, stopReason: "stop" }); expectedCost = estimateCostUsdCents(MODEL, usage.inputTokens, usage.outputTokens); break;
        case "refused": provider.mockRejectedValue(apiError(REFUSALS[int(r, 0, REFUSALS.length - 1)]!)); expectedCost = 0; break;
        case "doubt": { const make = DOUBTS[int(r, 0, DOUBTS.length - 1)]!; provider.mockRejectedValue(make()); expectedCost = "max"; break; }
        case "unknown_usage": provider.mockResolvedValue({ content: "ok", toolCalls: [], usage, usageKnown: false, stopReason: "stop" }); expectedCost = "max"; break;
        case "over_bound": provider.mockResolvedValue({ content: "ok", toolCalls: [], usage: { ...usage, outputTokens: request.maxTokens! + 1 }, stopReason: "stop" }); expectedCost = "max"; break;
        case "not_sent": provider.mockRejectedValue(new ModelRequestNotSentError("anthropic_schema_unsupported")); expectedCost = 0; break;
        case "abort_before_send": expectedCost = 0; break;
      }
      const factory = vi.fn((): EquipeModelClient => {
        if (outcome === "abort_before_send") throw new DOMException("aborted", "AbortError");
        chosen = { chat: provider };
        return chosen;
      });
      const client = createBudgetedModelClient({ scope, repos: t.deps.uow.repos, ledger, client: factory, free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => new Date(clock) });
      const error = await client.chat(request).then(() => null, (e: unknown) => e);
      const total = await ledger.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId);
      if (expectedTotal + maximum > CAP) {
        // The cap refuses before anything is reserved or sent.
        expect(error).toMatchObject({ message: "budget_exceeded" });
        expect(provider).not.toHaveBeenCalled();
        expect(factory).not.toHaveBeenCalled();
        expect(ledger.entries).toHaveLength(before.length);
        expect(total).toBe(expectedTotal);
        refusedByCap.push(step);
      } else {
        expect(ledger.entries).toHaveLength(before.length + 1);
        const entry = ledger.entries.at(-1)!;
        expect(entry.reservedCostUsdCents).toBe(maximum);
        if (outcome === "success") expect(error).toBeNull(); else expect(error).not.toBeNull();
        const cost = expectedCost === "max" ? maximum : expectedCost;
        expect(entry.costUsdCents).toBe(cost);
        if (expectedCost === "max") expect(entry.settledAt ?? undefined).toBeUndefined(); // A doubt stays open until the reconciler closes it, at the maximum.
        else expect(entry.settledAt?.getTime()).toBe(clock);
        expectedTotal += cost;
      }
      // The rows that were settled before are untouched by this call.
      for (const [i, was] of before.entries()) if (was.settledAt !== null) expect(snapshot(ledger)[i]).toEqual(was);
    }
    const total = await ledger.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId);
    expect(total).toBeLessThanOrEqual(CAP);
    expect(total).toBe(expectedTotal);
    expect(total).toBe(ledger.entries.reduce((sum, e) => sum + e.costUsdCents, 0));
  }
  return { expectedTotal, refusedByCap: refusedByCap.length, entries: ledger.entries.length };
}

describe("the free cap holds for any sequence of calls and reconciler runs", () => {
  it("120 random sequences of 40 steps: the total never passes 100 cents and always equals the sum of what each call cost", async () => {
    let capped = 0, reachedCap = 0, rows = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const out = await runSequence(seed * 7919, 40);
      if (out.refusedByCap > 0) capped++;
      if (out.expectedTotal > CAP - 20) reachedCap++;
      rows += out.entries;
    }
    // The generator must press on the cap, or the property proves nothing.
    expect(capped).toBeGreaterThan(20);
    expect(reachedCap).toBeGreaterThan(20);
    expect(rows).toBeGreaterThan(1500);
  }, 120_000);

  it("parallel calls are serialized by the account lock: doubts never overshoot the cap, and every call past it never reaches the provider", async () => {
    const { t, scope } = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const provider = vi.fn(async (): Promise<ModelCallResponse> => { throw apiError(503); });
    const base: ModelCallRequest = { model: MODEL, messages: [{ role: "user", content: "x".repeat(2000) }], maxTokens: 2048 };
    const request = { ...base, inputTokenBound: modelInputTokenBound(base)! };
    const maximum = maximumCallCostUsdCents(MODEL, request.inputTokenBound, request.maxTokens!)!;
    const client = createBudgetedModelClient({ scope, repos: t.deps.uow.repos, ledger, client: () => ({ chat: provider }), free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => new Date(START) });
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => client.chat(request)));
    const allowed = Math.floor(CAP / maximum);
    expect(provider).toHaveBeenCalledTimes(allowed);
    expect(results.filter(x => x.status === "rejected" && (x.reason as Error).message === "budget_exceeded")).toHaveLength(30 - allowed);
    expect(await ledger.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId)).toBe(allowed * maximum);
    expect(allowed * maximum).toBeLessThanOrEqual(CAP);
  });
});
