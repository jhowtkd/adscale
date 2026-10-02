// Property test (fixed seed) for the free account's US$ 1 cap (ticket 13, D-2): random sequences of calls through the budgeted client and the
// in-memory ledger, with the orphan reconciler running at random instants. Whatever the order, the books must add up and a doubt is never refunded.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { createBudgetedModelClient, MODEL_CALL_REJECTED_EVENT } from "./budgeted-client";
import { modelInputTokenBound } from "./free-budget";
import { estimateCostUsdCents, maximumCallCostUsdCents, MemoryLedgerStore } from "./ledger";
import { ModelRequestNotSentError, type EquipeModelClient, type ModelCallRequest, type ModelCallResponse } from "./model-client";

const MODEL = "claude-opus-5-5";
const CAP = 100;
/** The review of PR 614 fixed it at five give-backs per account; written out here so changing the constant fails this test. */
const GIVE_BACK_LIMIT = 5;
const START = new Date("2026-10-15T15:00:00.000Z").getTime();

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const PARAM_PATH = "output_config.format.schema: property 'maxItems' is not supported";
const anthropicError = (status: number, message = "m", type = "invalid_request_error") => Anthropic.APIError.generate(status, { type: "error", error: { type, message }, request_id: "r" }, `${status} ${message}`, new Headers());
const apiError = (status: number) => anthropicError(status);
// Even with a parameter path in its message, a 400/422 of an OpenAI-shaped provider is raised after the model ran (json_validate_failed): no proof.
const openaiError = (status: number) => OpenAI.APIError.generate(status, { error: { message: PARAM_PATH, type: "invalid_request_error", code: "json_validate_failed" } }, `${status} ${PARAM_PATH}`, new Headers());
type Outcome = "success" | "refused" | "doubt" | "unknown_usage" | "over_bound" | "abort_before_send" | "not_sent";
const OUTCOMES: Outcome[] = ["success", "success", "success", "refused", "doubt", "doubt", "unknown_usage", "over_bound", "abort_before_send", "not_sent"];
// A doubt: a 400/422 that does not open with a request parameter path, ANY 400/422 of an OpenAI-shaped provider (Meta), and everything without proof.
const DOUBTS = [() => apiError(503), () => anthropicError(400, "Output blocked by content filtering policy"), () => anthropicError(422, "prompt is too long: 300000 tokens"),
  () => anthropicError(400, "credit balance is too low"), () => openaiError(400), () => openaiError(422), () => apiError(409), () => apiError(429), () => apiError(408), () => new Anthropic.APIConnectionError({ message: "hang up" }), () => new Anthropic.APIConnectionTimeoutError(),
  () => new Anthropic.APIUserAbortError(), () => new Error("provider_down"), () => "boom"];
// Proof that nothing ran: 401/403/404/413 from any provider, and a 400/422 of Anthropic opening with a request parameter path.
const REFUSALS = [() => anthropicError(401, "m", "authentication_error"), () => anthropicError(403, "m", "permission_error"), () => anthropicError(404, "m", "not_found_error"),
  () => anthropicError(413, "m", "request_too_large"), () => anthropicError(400, PARAM_PATH), () => anthropicError(422, "messages.0.content.1.image.source.url: bad"),
  () => openaiError(401), () => openaiError(403), () => openaiError(404), () => openaiError(413)];

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
  let expectedTotal = 0, limitedCalls = 0;
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
      let expectedCost: number | "max" | "zero_if_room";
      switch (outcome) {
        case "success": provider.mockResolvedValue({ content: "ok", toolCalls: [], usage, stopReason: "stop" }); expectedCost = estimateCostUsdCents(MODEL, usage.inputTokens, usage.outputTokens); break;
        case "refused": provider.mockRejectedValue(REFUSALS[int(r, 0, REFUSALS.length - 1)]!()); expectedCost = "zero_if_room"; break;
        case "doubt": { const make = DOUBTS[int(r, 0, DOUBTS.length - 1)]!; provider.mockRejectedValue(make()); expectedCost = "max"; break; }
        case "unknown_usage": provider.mockResolvedValue({ content: "ok", toolCalls: [], usage, usageKnown: false, stopReason: "stop" }); expectedCost = "max"; break;
        case "over_bound": provider.mockResolvedValue({ content: "ok", toolCalls: [], usage: { ...usage, outputTokens: request.maxTokens! + 1 }, stopReason: "stop" }); expectedCost = "max"; break;
        case "not_sent": provider.mockRejectedValue(new ModelRequestNotSentError("anthropic_schema_unsupported")); expectedCost = "zero_if_room"; break;
        case "abort_before_send": expectedCost = "zero_if_room"; break;
      }
      const factory = vi.fn((): EquipeModelClient => {
        if (outcome === "abort_before_send") throw new DOMException("aborted", "AbortError");
        chosen = { chat: provider };
        return chosen;
      });
      const client = createBudgetedModelClient({ scope, repos: t.deps.uow.repos, ledger, client: factory, free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => new Date(clock) });
      // A give-back is worth at most GIVE_BACK_LIMIT rows (settled at zero with a reservation) in the account's life; past it, the maximum stays.
      const givenBack = ledger.entries.filter(e => e.settledAt && e.costUsdCents === 0 && (e.reservedCostUsdCents ?? 0) > 0).length;
      const limited = expectedCost === "zero_if_room" && givenBack >= GIVE_BACK_LIMIT;
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
        const keepsMax = expectedCost === "max" || limited;
        const cost = keepsMax ? maximum : expectedCost === "zero_if_room" ? 0 : expectedCost;
        expect(entry.costUsdCents).toBe(cost);
        if (keepsMax) expect(entry.settledAt ?? undefined).toBeUndefined(); // A doubt stays open until the reconciler closes it, at the maximum.
        else expect(entry.settledAt?.getTime()).toBe(clock);
        if (limited) limitedCalls++;
        // The event of a refusal never carries the provider's text, only structured fields.
        for (const event of await t.deps.uow.repos.events.list(scope, { eventType: MODEL_CALL_REJECTED_EVENT })) {
          expect(Object.keys(event.payload as object).every(k => ["role", "model", "taskKind", "kind", "status", "errorType", "code", "requestId", "param", "reason", "schema", "message"].includes(k))).toBe(true);
          expect(JSON.stringify(event.payload)).not.toMatch(/Output blocked|credit balance|prompt is too long|is not supported/);
        }
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
  return { expectedTotal, refusedByCap: refusedByCap.length, entries: ledger.entries.length, limitedCalls, givenBack: await ledger.countGivenBackReservations(scope.workspaceId, scope.accountId) };
}

describe("the free cap holds for any sequence of calls and reconciler runs", () => {
  it("120 random sequences of 40 steps: the total never passes 100 cents and always equals the sum of what each call cost", async () => {
    let capped = 0, reachedCap = 0, rows = 0, limited = 0, maxGivenBack = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const out = await runSequence(seed * 7919, 40);
      if (out.refusedByCap > 0) capped++;
      if (out.expectedTotal > CAP - 20) reachedCap++;
      rows += out.entries; limited += out.limitedCalls; maxGivenBack = Math.max(maxGivenBack, out.givenBack);
      expect(out.givenBack).toBeLessThanOrEqual(GIVE_BACK_LIMIT);
    }
    // The generator must press on the cap, or the property proves nothing.
    expect(capped).toBeGreaterThan(20);
    expect(reachedCap).toBeGreaterThan(20);
    expect(rows).toBeGreaterThan(1500);
    expect(limited).toBeGreaterThan(5); // The give-back limit was reached by some sequences.
    expect(maxGivenBack).toBe(GIVE_BACK_LIMIT);
  }, 120_000);

  it("the give-back limit is per account: the 6th proven refusal of one account keeps its maximum while another account still gets its zero", async () => {
    const base: ModelCallRequest = { model: MODEL, messages: [{ role: "user", content: "x" }], maxTokens: 300 };
    const request = { ...base, inputTokenBound: modelInputTokenBound(base)! };
    const maximum = maximumCallCostUsdCents(MODEL, request.inputTokenBound, request.maxTokens!)!;
    const ledger = new MemoryLedgerStore();
    const refuse = async (a: Awaited<ReturnType<typeof freeAccount>>) => {
      const client = createBudgetedModelClient({ scope: a.scope, repos: a.t.deps.uow.repos, ledger, client: () => ({ chat: async () => { throw anthropicError(400, PARAM_PATH); } }),
        free: true, model: MODEL, role: "strategist", taskKind: "handoff_vision", now: () => new Date(START) });
      await expect(client.chat(request)).rejects.toBeTruthy();
    };
    const [one, two] = [await freeAccount(), await freeAccount()];
    const total = (a: typeof one) => ledger.lifetimeTotalCostUsdCents(a.scope.workspaceId, a.scope.accountId);
    for (let i = 0; i < GIVE_BACK_LIMIT; i++) await refuse(one);
    expect(await total(one)).toBe(0);
    await refuse(one); await refuse(one);
    expect(await total(one)).toBe(2 * maximum);
    const events = await one.t.deps.uow.repos.events.list(one.scope, { eventType: MODEL_CALL_REJECTED_EVENT });
    expect(events.map(e => (e.payload as { reason: string }).reason)).toEqual([...Array(5).fill("schema_unsupported"), "give_back_limit", "give_back_limit"]);
    await refuse(two);
    expect(await total(two)).toBe(0);
    // The reconciler never gives back what the limit kept.
    await ledger.settleExpiredReservations(new Date(START + 16 * 60_000));
    expect(await total(one)).toBe(2 * maximum);
  });

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
