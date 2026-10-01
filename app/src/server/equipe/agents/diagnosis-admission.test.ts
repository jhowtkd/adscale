// Free diagnosis admission (ticket 08): the diagnosis task goes through the
// same per-call admission as the free Estrategista, but is paid from the
// reserve kept for it. Uses the real runner on the memory ledger.

import { afterEach, describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, type TestDeps } from "../module/testing/deps";
import { confirmedHandoff, requestDiagnosis, SITE_TEXT } from "../module/testing/diagnosis";
import { buildDiagnosisInput } from "../handoff/diagnosis";
import { DIAGNOSTIC_RECORDED_EVENT, hasRecordedDiagnostic, modelInputTokenBound } from "./free-budget";
import { MemoryLedgerStore, maximumCallCostUsdCents } from "./ledger";
import { BUDGET_EXCEEDED_ERROR, createEquipeAgents } from "./runner";
import { FakeModelClient } from "./testing";
import { DIAGNOSIS_MAX_TOKENS } from "./diagnosis";

const NOW = new Date("2026-10-15T15:00:00.000Z");
const MODEL = "muse-spark-1.3-contributor";
const QUOTE = "Torramos café especial de origem única";
const GOOD = JSON.stringify({
  summary: { text: "Torrefação.", evidence: [{ source: "site", quote: QUOTE }] },
  channels: [],
  opportunities: [{ title: "Mostrar a origem", evidence: [{ source: "site", quote: QUOTE }] }],
  notFound: [],
});

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | number) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = String(value);
}
afterEach(() => {
  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  saved.clear();
});

async function setup(t: TestDeps = makeTestDeps({ now: NOW })) {
  const f = await confirmedHandoff(t);
  const [row] = await t.deps.uow.repos.handoffs.list(f.scope);
  const input = buildDiagnosisInput(row!);
  const ledger = new MemoryLedgerStore();
  const diagnosis = { kind: "diagnosis" as const, workspaceId: f.workspaceId, accountId: f.accountId, input };
  const strategist = { kind: "strategist_turn" as const, workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Oi" } };
  return { ...f, t, input, ledger, diagnosis, strategist };
}

async function seedSpend(s: Awaited<ReturnType<typeof setup>>, cents: number) {
  await s.ledger.record({ workspaceId: s.workspaceId, accountId: s.accountId, role: "research", model: MODEL, promptVersion: "v", taskKind: "research",
    inputTokens: 0, outputTokens: 0, costUsdCents: cents });
}

/** The real command chain that writes the document + diagnostic.recorded (what the job does at the end). */
async function recordForReal(s: Awaited<ReturnType<typeof setup>>) {
  const actor = { kind: "system", job: "equipe.handoff.diagnose" } as const;
  const scope = { workspaceId: s.workspaceId, accountId: s.accountId, actor };
  const claim = await executeCommand(s.t.deps, scope, { type: "diagnosis_claim", payload: { taskIntentId: s.taskIntentId } });
  expect(claim.ok && claim.value.data).toMatchObject({ claimed: true });
  const recorded = await executeCommand(s.t.deps, scope, { type: "diagnosis_record", payload: {
    taskIntentId: s.taskIntentId, model: MODEL, promptVersion: "v", output: JSON.parse(GOOD),
  } });
  expect(recorded.ok).toBe(true);
}

describe("free diagnosis admission", () => {
  it("is allowed for a free account and goes through the admission: reserve before the send, settle, single attempt", async () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 10);
    const s = await setup();
    const seen: Array<{ rows: unknown[] }> = [];
    const client = new FakeModelClient([{ content: GOOD, usage: { inputTokens: 3000, outputTokens: 400 } }]);
    const chat = client.chat.bind(client);
    client.chat = async request => { seen.push({ rows: s.ledger.entries.map(e => ({ ...e })) }); return chat(request); };
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });

    const result = await agents.runTask(s.diagnosis);
    expect(result.ok).toBe(true);
    const request = client.requests[0]!;
    expect(request.noRetries).toBe(true);
    expect(request.maxTokens).toBe(DIAGNOSIS_MAX_TOKENS);
    expect(request.inputTokenBound).toBeGreaterThanOrEqual(modelInputTokenBound({ ...request, inputTokenBound: undefined })!);
    // the maximum was already reserved (unsettled) while the provider call ran
    expect(seen[0]!.rows).toHaveLength(1);
    const reserved = (seen[0]!.rows[0] as { reservedCostUsdCents: number }).reservedCostUsdCents;
    expect((seen[0]!.rows[0] as { settledAt?: Date }).settledAt).toBeUndefined();
    expect(reserved).toBe(maximumCallCostUsdCents(MODEL, request.inputTokenBound!, request.maxTokens!));
    // and settled to the real usage afterwards
    expect(s.ledger.entries).toHaveLength(1);
    expect(s.ledger.entries[0]).toMatchObject({ role: "research", taskKind: "diagnosis", model: MODEL, inputTokens: 3000, outputTokens: 400, settledAt: NOW });
    expect(s.ledger.entries[0]!.costUsdCents).toBeLessThanOrEqual(reserved);
  });

  it("refuses an input with extra keys (history, origin, uploads) before any model call", async () => {
    const s = await setup();
    const client = new FakeModelClient([{ content: GOOD }]);
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });
    for (const extra of [{ history: ["oi"] }, { origin: "user" }, { uploads: [{ key: "k" }] }]) {
      const result = await agents.runTask({ ...s.diagnosis, input: { ...s.input, ...extra } as never });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/^invalid_agent_input/);
    }
    // a nested extra key too (colors are strict)
    const nested = await agents.runTask({ ...s.diagnosis, input: { ...s.input, site: { text: "x".repeat(300), url: "https://typed.example" } } as never });
    expect(nested.ok).toBe(false);
    expect(client.requests).toHaveLength(0);
    expect(s.ledger.entries).toHaveLength(0);
  });

  it("budget_exceeded when even the diagnosis does not fit, without calling the model", async () => {
    const s = await setup();
    await seedSpend(s, 100);
    const client = new FakeModelClient([{ content: GOOD }]);
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });
    expect(await agents.runTask(s.diagnosis)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.requests).toHaveLength(0);
  });

  it("the reserve is kept for the diagnosis: with cap 100, reserve 10 and 89 spent, the Estrategista is refused and the diagnosis admitted", async () => {
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 100);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 10);
    const s = await setup();
    await seedSpend(s, 89);
    const client = new FakeModelClient([{ content: GOOD, usage: { inputTokens: 2000, outputTokens: 300 } }]);
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });

    expect(await agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.requests).toHaveLength(0);

    const diagnosed = await agents.runTask(s.diagnosis);
    expect(diagnosed.ok).toBe(true);
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]!.output?.name).toBe("equipe_diagnosis");
  });

  it("after diagnosis_record (diagnostic.recorded) the reserve is released and the Estrategista is admitted again", async () => {
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 100);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 10);
    const s = await setup();
    await seedSpend(s, 89);
    const client = new FakeModelClient([{ content: GOOD, usage: { inputTokens: 2000, outputTokens: 300 } }, { content: "Oi, Ana!" }]);
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });
    expect((await agents.runTask(s.diagnosis)).ok).toBe(true);
    expect(await agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });

    await recordForReal(s);
    expect(await hasRecordedDiagnostic(s.t.deps.uow.repos, s.scope)).toBe(true);
    const released = await agents.runTask(s.strategist);
    expect(released.ok).toBe(true);
    expect(client.requests).toHaveLength(2);
  });

  it("without a configured reserve the whole cap is reserved: chat opens only after the diagnosis is recorded", async () => {
    const s = await setup();
    const client = new FakeModelClient([{ content: GOOD, usage: { inputTokens: 2000, outputTokens: 300 } }, { content: "Oi!" }]);
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });
    expect(await agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect((await agents.runTask(s.diagnosis)).ok).toBe(true);
    expect(await agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    await recordForReal(s);
    expect((await agents.runTask(s.strategist)).ok).toBe(true);
  });

  it("an insufficient document (no model call) also releases the reserve", async () => {
    const t = makeTestDeps({ now: NOW });
    const f = await confirmedHandoff(t, { site: "Café Aurora. Torra própria.", instagram: null });
    const client = new FakeModelClient([{ content: "Oi!" }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger: new MemoryLedgerStore(), now: () => NOW });
    const strategist = { kind: "strategist_turn" as const, workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Oi" } };
    expect(await agents.runTask(strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    const actor = { kind: "system", job: "equipe.handoff.diagnose" } as const;
    const scope = { workspaceId: f.workspaceId, accountId: f.accountId, actor };
    await executeCommand(t.deps, scope, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
    const recorded = await executeCommand(t.deps, scope, { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
    expect(recorded.ok && recorded.value.data).toMatchObject({ status: "insufficient" });
    const events = await t.deps.uow.repos.events.list(f.scope, { eventType: DIAGNOSTIC_RECORDED_EVENT });
    expect(events).toHaveLength(1);
    expect((await agents.runTask(strategist)).ok).toBe(true);
  });
});

describe("re-reserve after the source is reopened", () => {
  /** Insufficient v1 (no model call) → the approver reopens the source → a new confirmed reading whose v2 is still pending. */
  async function pendingSecondDiagnosis() {
    const t = makeTestDeps({ now: NOW });
    const f = await confirmedHandoff(t, { site: "Café Aurora. Torra própria.", instagram: null });
    const job = { kind: "system", job: "equipe.handoff.diagnose" } as const;
    await executeCommand(t.deps, { actor: job, workspaceId: f.workspaceId, accountId: f.accountId }, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
    const first = await executeCommand(t.deps, { actor: job, workspaceId: f.workspaceId, accountId: f.accountId },
      { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
    expect(first.ok).toBe(true);
    const asApprover = { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId };
    const reopened = await executeCommand(t.deps, asApprover, { type: "diagnosis_correct_source", payload: {} });
    expect(reopened.ok).toBe(true);
    const [row] = await t.deps.uow.repos.handoffs.list(f.scope);
    const set = await executeCommand(t.deps, asApprover, { type: "handoff_set_source", payload: { expectedStep: "source", expectedVersion: row!.version, kind: "site", value: "https://cafenovo.com.br" } });
    expect(set.ok).toBe(true);
    const after = (await t.deps.uow.repos.handoffs.list(f.scope))[0]!;
    await t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "done", captured: { publicContent: [{ id: "x", value: SITE_TEXT, origin: "site" }] } });
    const secondIntent = await requestDiagnosis(t, f.scope, f.handoffId, after.readingId!);
    const [done] = await t.deps.uow.repos.handoffs.list(f.scope);
    const ledger = new MemoryLedgerStore();
    return {
      t, f, secondIntent, ledger, job,
      input: buildDiagnosisInput(done!),
      strategist: { kind: "strategist_turn" as const, workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Oi" } },
    };
  }

  it("the reserve is back: with reserve 10 and 89 spent the Estrategista is refused and the v2 diagnosis admitted", async () => {
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 100);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 10);
    const s = await pendingSecondDiagnosis();
    await s.ledger.record({ workspaceId: s.f.workspaceId, accountId: s.f.accountId, role: "research", model: MODEL, promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 89 });
    const client = new FakeModelClient([{ content: GOOD, usage: { inputTokens: 2000, outputTokens: 300 } }, { content: "Oi!" }]);
    const agents = createEquipeAgents({ moduleDeps: s.t.deps, client, ledger: s.ledger, now: () => NOW });
    expect(await hasRecordedDiagnostic(s.t.deps.uow.repos, s.f.scope)).toBe(false);
    expect(await agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(client.requests).toHaveLength(0);

    const diagnosed = await agents.runTask({ kind: "diagnosis", workspaceId: s.f.workspaceId, accountId: s.f.accountId, input: s.input });
    expect(diagnosed.ok).toBe(true);
    expect(client.requests).toHaveLength(1);

    // the v2 record releases it again
    const scope = { actor: s.job, workspaceId: s.f.workspaceId, accountId: s.f.accountId };
    await executeCommand(s.t.deps, scope, { type: "diagnosis_claim", payload: { taskIntentId: s.secondIntent } });
    const recorded = await executeCommand(s.t.deps, scope, { type: "diagnosis_record", payload: { taskIntentId: s.secondIntent, model: MODEL, promptVersion: "v", output: JSON.parse(GOOD) } });
    expect(recorded.ok && recorded.value.data).toMatchObject({ version: 2 });
    expect((await agents.runTask(s.strategist)).ok).toBe(true);
  });
});

describe("the reserve follows a correction that cannot finish", () => {
  const GROUPS = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
  const run = (status: string) => ({ runId: crypto.randomUUID(), taskIntentId: crypto.randomUUID(), status });

  async function reopenedAccount() {
    const t = makeTestDeps({ now: NOW });
    const f = await confirmedHandoff(t, { site: "Café Aurora. Torra própria.", instagram: null });
    const job = { kind: "system", job: "equipe.handoff.diagnose" } as const;
    const system = { workspaceId: f.workspaceId, accountId: f.accountId, actor: job };
    await executeCommand(t.deps, system, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
    await executeCommand(t.deps, system, { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
    const reopened = await executeCommand(t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver }, { type: "diagnosis_correct_source", payload: {} });
    expect(reopened.ok).toBe(true);
    const ledger = new MemoryLedgerStore();
    await ledger.record({ workspaceId: f.workspaceId, accountId: f.accountId, role: "research", model: MODEL, promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 89 });
    const client = new FakeModelClient([{ content: "Oi, Ana!" }, { content: "Oi de novo!" }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger, now: () => NOW });
    const strategist = { kind: "strategist_turn" as const, workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Oi" } };
    return { t, f, job, client, agents, strategist, system };
  }

  const prepare = () => { setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 100); setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 10); };

  it("a live correction (readings left) keeps the reserve: the Estrategista is refused", async () => {
    prepare();
    const s = await reopenedAccount();
    expect(await s.agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect(s.client.requests).toHaveLength(0);
  });

  it("a live correction with a running reading keeps it too (readings exhausted but a group is running)", async () => {
    prepare();
    const s = await reopenedAccount();
    await s.t.deps.uow.repos.handoffs.update(s.f.scope, s.f.handoffId, { step: "reading", readsUsed: 3, reading: Object.fromEntries(GROUPS.map(group => [group, run(group === "name" ? "running" : "not_found")])) } as never);
    expect(await s.agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
  });

  it("a stuck reading (no reading left, every group finished) releases the reserve: the same call is admitted", async () => {
    prepare();
    const s = await reopenedAccount();
    expect(await s.agents.runTask(s.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    await s.t.deps.uow.repos.handoffs.update(s.f.scope, s.f.handoffId, { step: "reading", readsUsed: 3, reading: Object.fromEntries(GROUPS.map(group => [group, run(group === "name" ? "failed" : "not_found")])) } as never);
    expect(await hasRecordedDiagnostic(s.t.deps.uow.repos, s.f.scope)).toBe(true);
    expect((await s.agents.runTask(s.strategist)).ok).toBe(true);
    expect(s.client.requests).toHaveLength(1);
  });

  it("a replacement diagnosis that failed for good releases the reserve; a retryable failure does not", async () => {
    prepare();
    const retryable = await reopenedAccount();
    const row = (id: string) => retryable.t.deps.uow.repos.handoffs.update(retryable.f.scope, retryable.f.handoffId, { step: "done", readingId: id, readsUsed: 2 } as never);
    const readingId = crypto.randomUUID();
    await row(readingId);
    const intent = await requestDiagnosis(retryable.t, retryable.f.scope, retryable.f.handoffId, readingId);
    await executeCommand(retryable.t.deps, retryable.system, { type: "diagnosis_fail", payload: { taskIntentId: intent, code: "provider_error" } });
    expect(await retryable.agents.runTask(retryable.strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });

    const final = await reopenedAccount();
    const finalReading = crypto.randomUUID();
    await final.t.deps.uow.repos.handoffs.update(final.f.scope, final.f.handoffId, { step: "done", readingId: finalReading, readsUsed: 2 } as never);
    const finalIntent = await requestDiagnosis(final.t, final.f.scope, final.f.handoffId, finalReading);
    await executeCommand(final.t.deps, final.system, { type: "diagnosis_fail", payload: { taskIntentId: finalIntent, code: "budget_exceeded" } });
    expect((await final.agents.runTask(final.strategist)).ok).toBe(true);
  });
});

describe("the reserve after the correction is given up", () => {
  it("restoring the earlier diagnosis releases the reserve again", async () => {
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 100);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 10);
    const t = makeTestDeps({ now: NOW });
    const f = await confirmedHandoff(t, { site: "Café Aurora. Torra própria.", instagram: null });
    const system = { workspaceId: f.workspaceId, accountId: f.accountId, actor: { kind: "system", job: "equipe.handoff.diagnose" } as const };
    const asApprover = { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver };
    await executeCommand(t.deps, system, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
    await executeCommand(t.deps, system, { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
    expect((await executeCommand(t.deps, asApprover, { type: "diagnosis_correct_source", payload: {} })).ok).toBe(true);
    const ledger = new MemoryLedgerStore();
    await ledger.record({ workspaceId: f.workspaceId, accountId: f.accountId, role: "research", model: MODEL, promptVersion: "v", taskKind: "research",
      inputTokens: 0, outputTokens: 0, costUsdCents: 89 });
    const client = new FakeModelClient([{ content: "Oi!" }]);
    const agents = createEquipeAgents({ moduleDeps: t.deps, client, ledger, now: () => NOW });
    const strategist = { kind: "strategist_turn" as const, workspaceId: f.workspaceId, accountId: f.accountId, input: { message: "Oi" } };

    expect(await agents.runTask(strategist)).toEqual({ ok: false, error: BUDGET_EXCEEDED_ERROR });
    expect((await executeCommand(t.deps, asApprover, { type: "diagnosis_restore_previous", payload: {} })).ok).toBe(true);
    expect((await agents.runTask(strategist)).ok).toBe(true);
  });
});
