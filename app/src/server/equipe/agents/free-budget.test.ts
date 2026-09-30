// Free-account lifetime cap: pure helpers and the runner admission contract
// (reserve before network, serialize, settle, never retry) on the memory ledger.

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid, type TestDeps } from "../module/testing/deps";
import {
  DIAGNOSTIC_RECORDED_EVENT, diagnosticReserveUsdCents, freeBudgetUsdCents, freeStrategistMaxTokens,
  hasRecordedDiagnostic, textInputTokenBound, withTextInputBound,
} from "./free-budget";
import { MemoryLedgerStore, maximumCallCostUsdCents } from "./ledger";
import type { EquipeModelClient, ModelCallRequest, ModelCallResponse } from "./model-client";
import { BUDGET_EXCEEDED_EVENT } from "./ledger";
import { BUDGET_EXCEEDED_ERROR, createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";

// Lets a test make the caller declare a hostile/missing bound; default = the real helper.
const hook = vi.hoisted(() => ({ override: null as null | ((r: never, real: (r: never) => unknown) => unknown) }));
vi.mock("./free-budget", async (orig) => {
  const actual = await orig<typeof import("./free-budget")>();
  return { ...actual, withTextInputBound: (r: never) => (hook.override ? hook.override(r, actual.withTextInputBound as never) : actual.withTextInputBound(r)) };
});

const NOW = new Date("2026-10-15T15:00:00.000Z");
const STRATEGIST_MODEL = "claude-opus-5-5";
// The unit-test env falls back to a Proxy over process.env (raw strings), so
// overrides go through process.env exactly like a deployment would set them.
const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | number) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = String(value);
}
afterEach(() => {
  hook.override = null;
  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  saved.clear();
});

async function freeAccount(t: TestDeps = makeTestDeps({ now: NOW })) {
  const workspaceId = uuid();
  const userId = `user-${uuid()}`;
  t.store.workspaceMembers.rows.set(uuid(), { id: uuid(), workspaceId, userId, name: "Ana", email: "a@x.com", emailVerified: true });
  const opened = await executeCommand(t.deps, { actor: { kind: "system", job: "free" }, workspaceId },
    { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(opened.error.code);
  return { t, workspaceId, accountId: opened.value.accountId!, scope: { workspaceId, accountId: opened.value.accountId! } };
}

async function recordDiagnostic(a: Awaited<ReturnType<typeof freeAccount>>, payload: unknown = { documentId: uuid() }) {
  await a.t.deps.uow.repos.events.create(a.scope, { actorType: "system", actorId: "diag", actorRole: "system",
    eventType: DIAGNOSTIC_RECORDED_EVENT, payload: payload as never, occurredAt: NOW });
}

const strategist = (a: { workspaceId: string; accountId: string }, message = "Oi") =>
  ({ kind: "strategist_turn", workspaceId: a.workspaceId, accountId: a.accountId, input: { message } });
const researchTask = (a: { workspaceId: string; accountId: string }) =>
  ({ kind: "research", workspaceId: a.workspaceId, accountId: a.accountId,
    input: { materials: [{ assetId: uuid(), label: "Site", excerpt: "texto" }] } });
const researchJson = JSON.stringify({ facts: [{ claim: "Fato", source: "Site", section: null }], diagnosis: "Ok." });

describe("free-budget helpers", () => {
  it("defaults to the US$ 1 cap, reserve = whole cap, and 2048 strategist tokens", () => {
    expect(freeBudgetUsdCents()).toBe(100);
    expect(diagnosticReserveUsdCents()).toBe(100);
    expect(freeStrategistMaxTokens()).toBe(2048);
  });

  it("honours env overrides and never lets the reserve exceed the cap", () => {
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 60);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 30);
    expect(diagnosticReserveUsdCents()).toBe(30);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 90);
    expect(diagnosticReserveUsdCents()).toBe(60);
    setEnv("EQUIPE_FREE_STRATEGIST_MAX_TOKENS", 512);
    expect(Number(freeStrategistMaxTokens())).toBe(512);
  });

  it("hasRecordedDiagnostic only accepts diagnostic.recorded with a non-empty documentId", async () => {
    const a = await freeAccount();
    expect(await hasRecordedDiagnostic(a.t.deps.uow.repos, a.scope)).toBe(false);
    for (const bad of [{}, null, { documentId: "" }, { documentId: 3 }]) await recordDiagnostic(a, bad);
    expect(await hasRecordedDiagnostic(a.t.deps.uow.repos, a.scope)).toBe(false);
    await a.t.deps.uow.repos.events.create(a.scope, { actorType: "system", actorId: "x", actorRole: "system",
      eventType: "diagnostic.other", payload: { documentId: "d" }, occurredAt: NOW });
    expect(await hasRecordedDiagnostic(a.t.deps.uow.repos, a.scope)).toBe(false);
    await recordDiagnostic(a);
    expect(await hasRecordedDiagnostic(a.t.deps.uow.repos, a.scope)).toBe(true);
  });
});

describe("textInputTokenBound", () => {
  const base: ModelCallRequest = { model: STRATEGIST_MODEL, messages: [{ role: "user", content: "olá" }] };

  it("bounds at least one token per byte of the WHOLE payload, including tools, schema and provider blocks", () => {
    const plain = textInputTokenBound(base)!;
    expect(plain).toBeGreaterThanOrEqual(Buffer.byteLength(JSON.stringify(base.messages)) + 4096);
    const withTools = textInputTokenBound({ ...base, tools: [{ name: "t", description: "d".repeat(2000), parameters: { type: "object" } } as never] })!;
    expect(withTools).toBeGreaterThan(plain + 2000);
    const withSchema = textInputTokenBound({ ...base, output: { name: "o", schema: z.object({ a: z.string() }) } })!;
    expect(withSchema).toBeGreaterThan(plain);
    // multibyte text is bounded by bytes, not characters
    const emoji = textInputTokenBound({ ...base, messages: [{ role: "user", content: "😀".repeat(100) }] })!;
    expect(emoji).toBeGreaterThanOrEqual(400 + 4096);
  });

  it("returns null for image parts and opaque image/document provider blocks", () => {
    expect(textInputTokenBound({ ...base, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://x/y.png" } }] as never }] })).toBeNull();
    expect(textInputTokenBound({ ...base, messages: [{ role: "assistant", content: null, providerContent: [{ type: "image", source: {} }] } as never] })).toBeNull();
    expect(textInputTokenBound({ ...base, messages: [{ role: "assistant", content: null, providerContent: [{ type: "document" }] } as never] })).toBeNull();
  });

  it("withTextInputBound sets inputTokenBound for text and leaves images without a bound", () => {
    expect(withTextInputBound(base).inputTokenBound).toBe(textInputTokenBound(base));
    const image = withTextInputBound({ ...base, messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "u" } }] as never }] });
    expect("inputTokenBound" in image).toBe(false);
  });

  it("maximumCallCostUsdCents is null for unpriced models and invalid bounds, and rounds up", () => {
    expect(maximumCallCostUsdCents("modelo-inventado", 100, 100)).toBeNull();
    expect(maximumCallCostUsdCents(STRATEGIST_MODEL, -1, 100)).toBeNull();
    expect(maximumCallCostUsdCents(STRATEGIST_MODEL, 1.5, 100)).toBeNull();
    expect(maximumCallCostUsdCents(STRATEGIST_MODEL, 100, 0)).toBeNull();
    // opus: max(input .4, cacheRead .02, cacheWrite .5) = .5/1k in; 2.0/1k out
    expect(maximumCallCostUsdCents(STRATEGIST_MODEL, 1000, 1000)).toBe(3);
    expect(maximumCallCostUsdCents(STRATEGIST_MODEL, 1, 1)).toBe(1);
  });
});

describe("free account runner admission", () => {
  it("reserves the maximum BEFORE the network call, then settles to actual usage, single attempt", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const seen: Array<{ request: ModelCallRequest; rows: unknown[] }> = [];
    const client: EquipeModelClient = {
      async chat(request) {
        seen.push({ request, rows: ledger.entries.map((e) => ({ ...e })) });
        return { content: "Oi!", toolCalls: [], usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "stop" };
      },
    };
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    const result = await agents.runTask(strategist(a));
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    const { request, rows } = seen[0]!;
    expect(request.noRetries).toBe(true);
    expect(request.maxTokens).toBeLessThanOrEqual(2048);
    expect(request.inputTokenBound).toBeGreaterThanOrEqual(textInputTokenBound(request)!);
    // the maximum row already existed, unsettled, while the provider call ran
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reservedCostUsdCents: expect.any(Number), costUsdCents: expect.any(Number) });
    const reserved = (rows[0] as { reservedCostUsdCents: number }).reservedCostUsdCents;
    expect((rows[0] as { settledAt?: Date }).settledAt).toBeUndefined();
    expect(reserved).toBe(maximumCallCostUsdCents(STRATEGIST_MODEL, request.inputTokenBound!, request.maxTokens!));
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({ inputTokens: 100, outputTokens: 10, settledAt: NOW });
    expect(ledger.entries[0]!.costUsdCents).toBeLessThanOrEqual(reserved);
    expect(ledger.entries[0]!.costUsdCents).toBe(1);
  });

  it("caps strategist maxTokens at the free limit even if a larger value is requested", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    setEnv("EQUIPE_FREE_STRATEGIST_MAX_TOKENS", 300);
    const a = await freeAccount();
    const client = new FakeModelClient([{ content: "ok" }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger: new MemoryLedgerStore(), now: () => NOW });
    await agents.runTask(strategist(a));
    expect(Number(client.requests[0]!.maxTokens)).toBe(300);
  });

  it("counts LIFETIME spend: last month's cost still consumes the free cap", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const old = await ledger.record({ ...a.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 99 });
    old.createdAt = new Date("2026-01-01T00:00:00Z");
    const client = new FakeModelClient([{ content: "never" }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    expect(await agents.runTask(strategist(a))).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.requests).toHaveLength(0);
    expect(ledger.entries).toHaveLength(1);
    const events = await a.t.deps.uow.repos.events.list(a.scope, { eventType: BUDGET_EXCEEDED_EVENT });
    expect(events[0]!.payload).toMatchObject({ totalCostUsdCents: 99, budgetUsdCents: 100 });
  });

  it("the diagnostic reserve blocks free strategist chat until the diagnostic is recorded", async () => {
    const a = await freeAccount(); // reserve defaults to the whole cap
    const ledger = new MemoryLedgerStore();
    const client = new FakeModelClient([{ content: "libera" }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    expect(await agents.runTask(strategist(a))).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.requests).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);

    await recordDiagnostic(a);
    const released = await agents.runTask(strategist(a));
    expect(released.ok).toBe(true);
    expect(client.requests).toHaveLength(1);
  });

  it("a partial reserve leaves exactly cap - reserve for free chat", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 95);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, ledger, now: () => NOW,
      client: new FakeModelClient([{ content: "a" }, { content: "b" }, { content: "c" }]) });
    // one strategist call reserves 9c > cap - reserve = 5 → blocked
    const first = await agents.runTask(strategist(a));
    expect(first).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 50);
    expect((await agents.runTask(strategist(a))).ok).toBe(true);
  });

  it("research ignores the diagnostic reserve but still respects the cap", async () => {
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const client = new FakeModelClient([{ content: researchJson }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    const result = await agents.runTask(researchTask(a));
    expect(result.ok).toBe(true);
    expect(client.requests[0]!.noRetries).toBe(true);
    expect(client.requests[0]!.inputTokenBound).toBeGreaterThan(0);
  });

  it("refuses free tasks that bypass the ledger with requires_plan and never calls a model", async () => {
    const a = await freeAccount();
    const client = new FakeModelClient([]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger: new MemoryLedgerStore(), now: () => NOW });
    const cases = [
      { kind: "writing", input: { workItemId: "w" } },
      { kind: "art_direction", input: { workId: "w" } },
      { kind: "review_text", input: { copy: { headline: "h", body: "b", cta: "c" } } },
      { kind: "review_visual", input: { imageUrl: "https://x/y.png" } },
      { kind: "measurement", input: { brandId: "b" } },
    ];
    for (const c of cases) {
      expect(await agents.runTask({ ...c, workspaceId: a.workspaceId, accountId: a.accountId })).toEqual({ ok: false, error: "requires_plan" });
    }
    expect(client.requests).toHaveLength(0);
  });

  it("fails closed for models without an explicit price (no fallback price)", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    setEnv("EQUIPE_MODEL_STRATEGIST", "modelo-sem-preco");
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const client = new FakeModelClient([{ content: "never" }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    expect(await agents.runTask(strategist(a))).toEqual({ ok: false, error: "free_call_unbounded" });
    expect(client.requests).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);
  });

  it("fails closed when a caller declares no bound, a too-small bound, or sends images", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const hostile: Array<(r: ModelCallRequest) => ModelCallRequest> = [
      (r) => { const { inputTokenBound: _omit, ...rest } = r; void _omit; return rest; },
      (r) => ({ ...r, inputTokenBound: 1 }),
      (r) => ({ ...r, inputTokenBound: 10_000_000,
        messages: [...r.messages, { role: "user", content: [{ type: "image_url", image_url: { url: "https://x/y.png" } }] as never }] }),
      (r) => ({ ...r, inputTokenBound: Number.NaN }),
    ];
    for (const mutate of hostile) {
      const a = await freeAccount();
      const ledger = new MemoryLedgerStore();
      const client = new FakeModelClient([{ content: "never" }]);
      const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
      hook.override = (r, real) => mutate(real(r) as ModelCallRequest);
      expect(await agents.runTask(strategist(a))).toEqual({ ok: false, error: "free_call_unbounded" });
      expect(client.requests).toHaveLength(0);
      expect(ledger.entries).toHaveLength(0);
    }
  });

  it("does NOT touch paid accounts: monthly cap semantics, no reservation, original client request", async () => {
    const t = makeTestDeps({ now: NOW });
    const { openTestAccount } = await import("../module/testing/deps");
    const account = await openTestAccount(t);
    const ledger = new MemoryLedgerStore();
    const client = new FakeModelClient([{ content: researchJson, usage: { inputTokens: 1000, outputTokens: 100 } }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger, now: () => NOW });
    const result = await agents.runTask(researchTask(account));
    expect(result.ok).toBe(true);
    expect(client.requests[0]!.noRetries).toBeUndefined();
    expect(ledger.entries[0]!.reservedCostUsdCents).toBeUndefined();
  });
});

describe("free account serialization and hard cap", () => {
  function gatedClient() {
    let inFlight = 0; let maxInFlight = 0; let calls = 0;
    const releases: Array<() => void> = [];
    const client: EquipeModelClient = {
      async chat() {
        calls += 1; inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => releases.push(resolve));
        inFlight -= 1;
        return { content: "ok", toolCalls: [], usage: { inputTokens: 8000, outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 }, stopReason: "stop" };
      },
    };
    return { client, stats: () => ({ inFlight, maxInFlight, calls }), releases };
  }
  const tick = () => new Promise((r) => setTimeout(r, 5));

  it("runs concurrent free calls one at a time, second reserves only after first settles", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const g = gatedClient();
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client: g.client, ledger, now: () => NOW });
    const p1 = agents.runTask(strategist(a));
    const p2 = agents.runTask(strategist(a));
    await tick();
    expect(g.stats()).toMatchObject({ calls: 1, inFlight: 1 });
    expect(ledger.entries).toHaveLength(1); // second has not even reserved
    g.releases.shift()!();
    await tick();
    expect(g.stats().calls).toBe(2);
    expect(ledger.entries.filter((e) => !e.settledAt)).toHaveLength(1); // first settled before second reserved
    g.releases.shift()!();
    expect((await Promise.all([p1, p2])).every((r) => r.ok)).toBe(true);
    expect(g.stats().maxInFlight).toBe(1);
  });

  it("never exceeds the cap with many concurrent calls: only those that fit run", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const g = gatedClient();
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client: g.client, ledger, now: () => NOW });
    const runs = Array.from({ length: 30 }, () => agents.runTask(strategist(a)));
    const release = setInterval(() => g.releases.splice(0).forEach((r) => r()), 2);
    const results = await Promise.all(runs);
    clearInterval(release);
    const ok = results.filter((r) => r.ok).length;
    const refused = results.filter((r) => !r.ok && r.error === BUDGET_EXCEEDED_ERROR).length;
    expect(ok + refused).toBe(30);
    expect(ok).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(g.stats().calls).toBe(ok);
    expect(g.stats().maxInFlight).toBe(1);
    const total = await ledger.lifetimeTotalCostUsdCents(a.workspaceId, a.accountId);
    expect(total).toBeLessThanOrEqual(100);
  });

  it("bounds strategist iterations: the cap stops the tool loop mid-turn and total never exceeds it", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    await ledger.record({ ...a.scope, role: "research", model: "muse-spark-1.3-contributor", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 60 });
    const looping = new FakeModelClient(Array.from({ length: 10 }, () => ({
      content: null, toolCalls: [{ id: "c", name: "get_goals", argumentsJson: "{}" }],
      usage: { inputTokens: 8000, outputTokens: 2000 },
    })));
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client: looping, ledger, now: () => NOW });
    const result = await agents.runTask({ ...strategist(a), input: { message: "loop", maxIterations: 10 } });
    expect(result).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    // 60 spent, each iteration settles at 8c and reserves 9c: 4 fit (92), the 5th (92+9) does not.
    expect(looping.requests).toHaveLength(4);
    expect(looping.requests.every((r) => r.noRetries === true)).toBe(true);
    expect(await ledger.lifetimeTotalCostUsdCents(a.workspaceId, a.accountId)).toBeLessThanOrEqual(100);
  });

  it("a provider error keeps the reservation at its maximum (no refund) and does not retry", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    let attempts = 0;
    const client: EquipeModelClient = { async chat() { attempts += 1; throw new Error("socket hang up"); } };
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    expect(await agents.runTask(researchTask(a))).toEqual({ ok: false, error: "socket hang up" });
    expect(attempts).toBe(1);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]!.settledAt).toBeUndefined();
    expect(ledger.entries[0]!.costUsdCents).toBe(ledger.entries[0]!.reservedCostUsdCents);
    expect(await ledger.lifetimeTotalCostUsdCents(a.workspaceId, a.accountId)).toBe(ledger.entries[0]!.reservedCostUsdCents);
  });

  it("unknown or fraudulent provider usage fails and keeps the reservation at its maximum (no refund)", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const usages: Array<{ usage: Partial<ModelCallResponse["usage"]>; usageKnown?: boolean; error: string }> = [
      { usage: { inputTokens: 1, outputTokens: 1 }, usageKnown: false, error: "free_usage_unknown" },
      { usage: { inputTokens: 10_000_000, outputTokens: 1 }, error: "free_call_bound_exceeded" },
      { usage: { inputTokens: 1, outputTokens: 10_000 }, error: "free_call_bound_exceeded" },
      { usage: { inputTokens: -1, outputTokens: 1 }, error: "free_call_bound_exceeded" },
      { usage: { inputTokens: 1.5, outputTokens: 1 }, error: "free_call_bound_exceeded" },
      { usage: { inputTokens: Number.NaN, outputTokens: 1 }, error: "free_call_bound_exceeded" },
      { usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 10_000_000 }, error: "free_call_bound_exceeded" },
      { usage: { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 10_000_000 }, error: "free_call_bound_exceeded" },
    ];
    for (const bad of usages) {
      const a = await freeAccount();
      const ledger = new MemoryLedgerStore();
      let attempts = 0;
      const client: EquipeModelClient = { async chat() {
        attempts += 1;
        return { content: "x", toolCalls: [], stopReason: "stop", ...(bad.usageKnown === false ? { usageKnown: false } : {}),
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, ...bad.usage } } as ModelCallResponse;
      } };
      const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
      expect(await agents.runTask(strategist(a))).toEqual({ ok: false, error: bad.error });
      expect(attempts).toBe(1);
      expect(ledger.entries).toHaveLength(1);
      expect(ledger.entries[0]!.settledAt).toBeUndefined();
      expect(ledger.entries[0]!.costUsdCents).toBe(ledger.entries[0]!.reservedCostUsdCents);
      expect(await ledger.lifetimeTotalCostUsdCents(a.workspaceId, a.accountId)).toBe(ledger.entries[0]!.reservedCostUsdCents);
    }
  });

  it("settle never lets actual cost exceed the reservation, and settling twice is a no-op", async () => {
    const ledger = new MemoryLedgerStore();
    const scope = { workspaceId: "w", accountId: "a" };
    const row = await ledger.record({ ...scope, role: "research", model: "m", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 5, reservedCostUsdCents: 5 });
    const usage = { model: "m", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
    await expect(ledger.settle(scope, row.id, usage, 6, NOW)).rejects.toThrow("free_call_bound_exceeded");
    await ledger.settle(scope, row.id, usage, 2, NOW);
    await ledger.settle(scope, row.id, usage, 4, new Date(NOW.getTime() + 1));
    expect(ledger.entries[0]).toMatchObject({ costUsdCents: 2, settledAt: NOW });
    // scoped: another account cannot settle it
    const other = await ledger.record({ ...scope, role: "research", model: "m", promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 5, reservedCostUsdCents: 5 });
    await ledger.settle({ workspaceId: "w", accountId: "other" }, other.id, usage, 1, NOW);
    expect(ledger.entries[1]!.settledAt).toBeUndefined();
  });

  it("reconciliation settles expired orphans at their maximum (no refund) and leaves fresh ones", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    const ledger = new MemoryLedgerStore();
    const client: EquipeModelClient = { async chat() { throw new Error("boom"); } };
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    await agents.runTask(strategist(a));
    const [orphan] = ledger.entries;
    expect(orphan!.reservationExpiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    await ledger.settleExpiredReservations(new Date(NOW.getTime() + 15 * 60_000 - 1));
    expect(orphan!.settledAt).toBeUndefined();
    const later = new Date(NOW.getTime() + 15 * 60_000);
    await ledger.settleExpiredReservations(later);
    expect(orphan).toMatchObject({ settledAt: later, costUsdCents: orphan!.reservedCostUsdCents });
    expect(await ledger.lifetimeTotalCostUsdCents(a.workspaceId, a.accountId)).toBe(orphan!.reservedCostUsdCents);
  });

  it("stops a paused/suspended account before reserving anything", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    const a = await freeAccount();
    await a.t.deps.uow.repos.accounts.update(a.workspaceId, a.accountId, { status: "closed" } as never);
    const ledger = new MemoryLedgerStore();
    const client = new FakeModelClient([{ content: "never" }]);
    const agents = createEquipeAgents({ moduleDeps: a.t.deps, client, ledger, now: () => NOW });
    const result = await agents.runTask(strategist(a));
    expect(result.ok).toBe(false);
    expect(client.requests).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);
  });
});
