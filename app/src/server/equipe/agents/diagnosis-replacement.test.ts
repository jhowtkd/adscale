// Ticket 08: a reopened diagnosis stops counting only while its replacement can still succeed.
// When the reading ran out of attempts, or the replacement diagnosis failed for good, the earlier
// diagnosis counts again (reserve released, plan gate open). State is built with the real commands.

import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { advancingClock, confirmedHandoff, requestDiagnosis } from "../module/testing/diagnosis";
import { DIAGNOSIS_REOPENED_EVENT } from "../handoff/diagnosis-contract";
import { replacementCanStillSucceed } from "../handoff/diagnosis-state";
import { DIAGNOSTIC_RECORDED_EVENT, hasRecordedDiagnostic } from "./free-budget";

const JOB = { kind: "system", job: "equipe.handoff.diagnose" } as const;
type F = Awaited<ReturnType<typeof confirmedHandoff>>;
const run = (status: string) => ({ runId: uuid(), taskIntentId: uuid(), status });
const GROUPS = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
const groups = (status: string, over: Record<string, string> = {}) => Object.fromEntries(GROUPS.map(group => [group, run(over[group] ?? status)]));

/** An insufficient diagnosis (recorded for real) that the approver sent back: diagnosis.reopened exists, step = source. */
async function reopenedFixture(): Promise<F> {
  const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
  advancingClock(f.t);
  const system = { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB };
  await executeCommand(f.t.deps, system, { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
  const recorded = await executeCommand(f.t.deps, system, { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
  expect(recorded.ok).toBe(true);
  expect(await has(f)).toBe(true);
  const reopened = await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver }, { type: "diagnosis_correct_source", payload: {} });
  expect(reopened.ok).toBe(true);
  return f;
}
const has = (f: F) => hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope);
const setHandoff = (f: F, patch: Record<string, unknown>) => f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, patch as never);
const events = (f: F, eventType: string) => f.t.deps.uow.repos.events.list(f.scope, { eventType });

/** The brand is confirmed again for a NEW reading and its diagnose intent exists. */
async function doneAgain(f: F) {
  const readingId = uuid();
  await setHandoff(f, { step: "done", readingId, readsUsed: 2 });
  const taskIntentId = await requestDiagnosis(f.t, f.scope, f.handoffId, readingId);
  return { readingId, taskIntentId };
}
const fail = (f: F, taskIntentId: string, code: string) =>
  executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB }, { type: "diagnosis_fail", payload: { taskIntentId, code } });

describe("hasRecordedDiagnostic — a reopened diagnosis and its replacement", () => {
  it("1. reopened, step source, readings left → false (the replacement can still happen)", async () => {
    const f = await reopenedFixture();
    expect((await f.t.deps.uow.repos.handoffs.list(f.scope))[0]).toMatchObject({ step: "source", readsUsed: 1 });
    expect(await has(f)).toBe(false);
  });

  it.each(["pending", "running"])("2. reopened, step reading, readings exhausted but a group is %s → false", async (status) => {
    const f = await reopenedFixture();
    await setHandoff(f, { step: "reading", readsUsed: 3, reading: groups("not_found", { name: status }) });
    expect(await has(f)).toBe(false);
  });

  it("3. reopened, step reading, readings exhausted, every group finished, name failed (stuck) → TRUE", async () => {
    const f = await reopenedFixture();
    await setHandoff(f, { step: "reading", readsUsed: 3, reading: groups("not_found", { name: "failed" }) });
    expect(await has(f)).toBe(true);
  });

  it("3b. stuck on a reading with every group found/not_found/failed mixed → TRUE", async () => {
    const f = await reopenedFixture();
    await setHandoff(f, { step: "reading", readsUsed: 3, reading: groups("found", { logo: "not_found", fonts: "failed" }) });
    expect(await has(f)).toBe(true);
  });

  it("4. reopened, step source, readings exhausted → TRUE", async () => {
    const f = await reopenedFixture();
    await setHandoff(f, { step: "source", readsUsed: 3 });
    expect(await has(f)).toBe(true);
  });

  it("4b. step source with an empty reading and 2 readings used → false (one is left)", async () => {
    const f = await reopenedFixture();
    await setHandoff(f, { step: "source", readsUsed: 2 });
    expect(await has(f)).toBe(false);
  });

  it.each(["identity", "networks", "images", "summary"])("5. reopened, step %s with the readings exhausted → false (the person can still go on)", async (step) => {
    const f = await reopenedFixture();
    await setHandoff(f, { step, readsUsed: 3, reading: groups("found") });
    expect(await has(f)).toBe(false);
  });

  it("6. reopened, done again, the latest intent has no failure → false", async () => {
    const f = await reopenedFixture();
    await doneAgain(f);
    expect(await has(f)).toBe(false);
  });

  it("7. reopened, done again, the latest intent failed with retryable:true → false (there is 'Tentar de novo')", async () => {
    const f = await reopenedFixture();
    const { taskIntentId } = await doneAgain(f);
    expect((await fail(f, taskIntentId, "provider_error")).ok).toBe(true);
    expect((await events(f, "diagnosis.failed")).at(-1)!.payload).toMatchObject({ retryable: true });
    expect(await has(f)).toBe(false);
  });

  it("8. reopened, done again, the latest intent failed with retryable:false → TRUE", async () => {
    const f = await reopenedFixture();
    const { taskIntentId } = await doneAgain(f);
    expect((await fail(f, taskIntentId, "budget_exceeded")).ok).toBe(true);
    expect((await events(f, "diagnosis.failed")).at(-1)!.payload).toMatchObject({ retryable: false });
    expect(await has(f)).toBe(true);
  });

  it("8b. the third and last intent failing (attempts exhausted) is final → TRUE", async () => {
    const f = await reopenedFixture();
    let { taskIntentId } = await doneAgain(f);
    for (let n = 1; n < 3; n++) {
      await fail(f, taskIntentId, "provider_error");
      expect(await has(f)).toBe(false);
      const retried = await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
      taskIntentId = (retried.ok ? retried.value.data.taskIntentId : "") as string;
    }
    await fail(f, taskIntentId, "provider_error");
    expect(await has(f)).toBe(true);
  });

  it("9. a final failure of an OLDER reading does not count: the current reading's latest intent is pending → false", async () => {
    const f = await reopenedFixture();
    const old = await requestDiagnosis(f.t, f.scope, f.handoffId, uuid());
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnosis.failed",
      payload: { taskIntentId: old, code: "budget_exceeded", retryable: false }, occurredAt: new Date() });
    await doneAgain(f);
    expect(await has(f)).toBe(false);
  });

  it("9a. even when the NEWEST intent of the account belongs to another reading and failed for good, the current reading is judged on its own → false", async () => {
    const f = await reopenedFixture();
    await doneAgain(f); // the current reading's intent is pending
    const other = await requestDiagnosis(f.t, f.scope, f.handoffId, uuid()); // created later, other reading
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnosis.failed",
      payload: { taskIntentId: other, code: "budget_exceeded", retryable: false }, occurredAt: new Date() });
    expect(await has(f)).toBe(false);
  });

  it("9b. only the LATEST intent of the current reading is judged: an old retryable-false failure followed by a pending retry → false", async () => {
    const f = await reopenedFixture();
    const { readingId, taskIntentId } = await doneAgain(f);
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnosis.failed",
      payload: { taskIntentId, code: "model_refused", retryable: false }, occurredAt: new Date() });
    await requestDiagnosis(f.t, f.scope, f.handoffId, readingId); // a newer intent, still running
    expect(await has(f)).toBe(false);
  });

  it("10a. reopened + the successor recorded → true", async () => {
    const f = await reopenedFixture();
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT,
      payload: { documentId: uuid() }, occurredAt: new Date() });
    expect(await has(f)).toBe(true);
  });

  it("10b. regression without any reopening: recorded → true, nothing → false", async () => {
    const t = makeTestDeps();
    const f = await confirmedHandoff(t);
    expect(await has(f)).toBe(false);
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: DIAGNOSTIC_RECORDED_EVENT,
      payload: { documentId: uuid() }, occurredAt: new Date() });
    expect(await has(f)).toBe(true);
  });

  it("10c. a reopening without a handoff row, or 'done' without a reading, gives the earlier diagnosis back → true", async () => {
    const noReading = await reopenedFixture();
    await setHandoff(noReading, { step: "done", readingId: null });
    expect(await has(noReading)).toBe(true);
    const noHandoff = await reopenedFixture();
    noHandoff.t.store.handoffs.rows.clear();
    expect(await has(noHandoff)).toBe(true);
  });

  it("a reopened event without any recorded diagnostic never creates one", async () => {
    const f = await confirmedHandoff(makeTestDeps());
    await f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: DIAGNOSIS_REOPENED_EVENT, payload: { documentId: "x" }, occurredAt: new Date() });
    await setHandoff(f, { step: "source", readsUsed: 3 });
    expect(await has(f)).toBe(false);
  });
});

describe("replacementCanStillSucceed", () => {
  it("mirrors the table: alive while moving, dead when stuck or failed for good", async () => {
    const alive = await reopenedFixture();
    expect(await replacementCanStillSucceed(alive.t.deps.uow.repos, alive.scope)).toBe(true);
    const stuck = await reopenedFixture();
    await setHandoff(stuck, { step: "source", readsUsed: 3 });
    expect(await replacementCanStillSucceed(stuck.t.deps.uow.repos, stuck.scope)).toBe(false);
  });
});
