// `diagnosisBlockedByBudget` against a reference model, over random lives of a free account (ticket 13, D-12). The model is a small state machine kept by the
// test from what each command REPORTS (not from the store), so it does not repeat the production query. Whatever happened, the account's `planAvailable` and the
// acceptance of `request_support(plan)` agree, and blocked means exactly: the latest intent of the current reading failed for good for lack of credit.
import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { getAccountState } from "../module/queries";
import { uuid, makeTestDeps } from "../module/testing/deps";
import { advancingClock, confirmedHandoff, requestDiagnosis } from "../module/testing/diagnosis";
import { HANDOFF_DIAGNOSE_EVENT } from "./contract";
import { diagnosisBlockedByBudget } from "./diagnosis-state";
import { DIAGNOSIS_FAILED_EVENT } from "./diagnosis-contract";
import { hasRecordedDiagnostic, planRequestAllowed } from "../agents/free-budget";

const JOB = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;
type F = Awaited<ReturnType<typeof confirmedHandoff>>;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T,>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
const CODES = ["budget_exceeded", "budget_exceeded", "provider_error", "model_truncated", "diagnosis_invalid", "execution_blocked", "model_refused", "diagnosis_unavailable", "something_new"] as const;

type Intent = { id: string; failure?: { code: string; retryable: boolean } };
type Model = { step: string; readingId: string; intents: Map<string, Intent[]>; recorded: Set<string>; reopened: Set<string>; docsByReading: Map<string, string> };

/** What the model says "blocked" means, from its own bookkeeping. */
const modelBlocked = (m: Model) => {
  if (m.step !== "done" || m.recorded.has(m.readingId)) return false;
  const latest = (m.intents.get(m.readingId) ?? []).at(-1);
  return latest?.failure !== undefined && !latest.failure.retryable && latest.failure.code === "budget_exceeded";
};

async function life(seed: number, steps: number) {
  const r = rng(seed);
  const f: F = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null }); // Short text: a diagnosis can be recorded without a model.
  advancingClock(f.t);
  const repos = f.t.deps.uow.repos;
  const asJob = { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB };
  const asApprover = { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver };
  const model: Model = { step: "done", readingId: f.readingId, intents: new Map([[f.readingId, [{ id: f.taskIntentId }]]]), recorded: new Set(), reopened: new Set(), docsByReading: new Map() };
  const stats = { blocked: 0, notBlocked: 0 };
  const intentsOfCurrent = () => model.intents.get(model.readingId) ?? [];
  for (let step = 0; step < steps; step++) {
    const op = pick(r, ["fail", "fail", "fail", "retry", "newIntent", "record", "newReading", "leaveDone", "backToDone", "correct", "restore", "stuck"] as const);
    switch (op) {
      case "fail": {
        const target = pick(r, [...intentsOfCurrent(), ...intentsOfCurrent().slice(-1), { id: uuid() }]);
        const code = pick(r, CODES);
        const out = await executeCommand(f.t.deps, asJob, { type: "diagnosis_fail", payload: { taskIntentId: target.id, code } });
        if (out.ok && !out.value.data.ignored && out.value.data.failed) { const known = intentsOfCurrent().find(i => i.id === target.id); if (known) known.failure = { code, retryable: Boolean(out.value.data.retryable) }; }
        break;
      }
      case "retry": {
        const out = await executeCommand(f.t.deps, asApprover, { type: "diagnosis_retry", payload: {} });
        if (out.ok) intentsOfCurrent().push({ id: String(out.value.data.taskIntentId) });
        break;
      }
      case "newIntent": { if (model.step === "done") intentsOfCurrent().push({ id: await requestDiagnosis(f.t, f.scope, f.handoffId, model.readingId) }); break; }
      case "record": {
        const target = pick(r, intentsOfCurrent());
        const out = await executeCommand(f.t.deps, asJob, { type: "diagnosis_record", payload: { taskIntentId: target.id, output: null, model: null, promptVersion: null } });
        if (out.ok && out.value.data.documentId) model.recorded.add(model.readingId);
        break;
      }
      case "newReading": {
        const readingId = uuid();
        await repos.handoffs.update(f.scope, f.handoffId, { step: "done", readingId, readsUsed: 1 });
        model.step = "done"; model.readingId = readingId;
        model.intents.set(readingId, [{ id: await requestDiagnosis(f.t, f.scope, f.handoffId, readingId) }]);
        break;
      }
      case "leaveDone": { await repos.handoffs.update(f.scope, f.handoffId, { step: pick(r, ["summary", "identity", "reading"] as const) }); model.step = "not-done"; break; }
      case "backToDone": { await repos.handoffs.update(f.scope, f.handoffId, { step: "done" }); model.step = "done"; break; }
      case "correct": { const out = await executeCommand(f.t.deps, asApprover, { type: "diagnosis_correct_source", payload: {} }); if (out.ok) model.step = "not-done"; break; }
      case "restore": { await executeCommand(f.t.deps, asApprover, { type: "diagnosis_restore_previous", payload: {} }); const [row] = await repos.handoffs.list(f.scope); model.step = row!.step === "done" ? "done" : "not-done"; break; }
      case "stuck": { await repos.handoffs.update(f.scope, f.handoffId, { readsUsed: 3 }); break; }
    }
    // Keep the model's idea of the reading and step in step with the real handoff (commands may refuse or move it).
    const [row] = await repos.handoffs.list(f.scope);
    model.step = row!.step === "done" ? "done" : "not-done";
    if (row!.readingId && row!.readingId !== model.readingId) { model.readingId = row!.readingId; if (!model.intents.has(model.readingId)) model.intents.set(model.readingId, []); }

    const blocked = await diagnosisBlockedByBudget(repos, f.scope);
    const label = `seed ${seed} step ${step} after ${op}`;
    expect(blocked, label).toBe(modelBlocked(model));
    if (blocked) stats.blocked++; else stats.notBlocked++;
    // The gates that follow it.
    const allowed = await planRequestAllowed(repos, f.scope);
    const state = await getAccountState(repos, f.workspaceId, f.accountId);
    expect(state?.planAvailable, label).toBe(allowed);
    if (blocked) expect(allowed, label).toBe(true);
    // The gate opens for a recorded diagnosis or for "blocked", and for nothing else.
    expect(allowed, label).toBe(blocked || (await hasRecordedDiagnostic(repos, f.scope)));
    const request = await executeCommand(f.t.deps, asApprover, { type: "request_support", payload: { purpose: "plan" } });
    expect(request.ok, `${label}: request_support(plan) accepted iff planAvailable`).toBe(Boolean(state?.planAvailable));
  }
  return stats;
}

describe("diagnosisBlockedByBudget over random lives of a free account", () => {
  it("equals the reference model after every command, and planAvailable ⇔ request_support(plan) accepted, in 60 lives of 25 steps", async () => {
    let blocked = 0, notBlocked = 0;
    for (let seed = 1; seed <= 60; seed++) { const s = await life(seed * 104729, 25); blocked += s.blocked; notBlocked += s.notBlocked; }
    expect(blocked).toBeGreaterThan(60);
    expect(notBlocked).toBeGreaterThan(300);
  }, 180_000);
});

describe("the predicate reads what the failure event says, not only the code", () => {
  const failureEvent = async (f: F, taskIntentId: string, payload: Record<string, unknown>) =>
    f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: DIAGNOSIS_FAILED_EVENT, payload: { taskIntentId, ...payload }, occurredAt: new Date() });

  it.each([
    ["a final budget failure", { code: "budget_exceeded", retryable: false }, true],
    ["a budget failure that may still be retried", { code: "budget_exceeded", retryable: true }, false],
    ["a budget failure with no retryable flag (an old event)", { code: "budget_exceeded" }, true],
    ["a final failure of another kind", { code: "provider_error", retryable: false }, false],
    ["a failure with no code", { retryable: false }, false],
    ["a code in another case", { code: "BUDGET_EXCEEDED", retryable: false }, false],
  ])("%s", async (_name, payload, blocked) => {
    const f = await confirmedHandoff();
    await failureEvent(f, f.taskIntentId, payload);
    expect(await diagnosisBlockedByBudget(f.t.deps.uow.repos, f.scope)).toBe(blocked);
    expect(await planRequestAllowed(f.t.deps.uow.repos, f.scope)).toBe(blocked);
  });

  it("a failure of ANOTHER intent does not block: only the latest intent of the current reading counts", async () => {
    const f = await confirmedHandoff();
    advancingClock(f.t);
    await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId);
    await failureEvent(f, f.taskIntentId, { code: "budget_exceeded", retryable: false });
    expect(await diagnosisBlockedByBudget(f.t.deps.uow.repos, f.scope)).toBe(false);
  });

  it("an account with no handoff, or whose handoff never had a reading, is not blocked", async () => {
    const f = await confirmedHandoff();
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { readingId: null });
    await failureEvent(f, f.taskIntentId, { code: "budget_exceeded", retryable: false });
    expect(await diagnosisBlockedByBudget(f.t.deps.uow.repos, f.scope)).toBe(false);
  });
});
