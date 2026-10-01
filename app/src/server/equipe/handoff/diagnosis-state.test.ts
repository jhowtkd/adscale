// Where a free diagnosis stands, read from what the account persisted (ticket 08).

import { describe, expect, it } from "vitest";
import { executeCommand } from "../module/commands";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { advancingClock, confirmedHandoff, requestDiagnosis } from "../module/testing/diagnosis";
import { HANDOFF_DIAGNOSE_EVENT } from "./contract";
import {
  currentRun, diagnoseIntents, diagnosisBlockedByBudget, diagnosisDocuments, diagnosisEventPending, eventsFor, isReadingStuck, readingOf,
} from "./diagnosis-state";

const JOB = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;
type F = Awaited<ReturnType<typeof confirmedHandoff>>;
const repos = (f: F) => f.t.deps.uow.repos;
const system = (f: F) => ({ workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB });
const command = (f: F, type: string, payload: Record<string, unknown>) => executeCommand(f.t.deps, system(f), { type, payload } as never);
const pending = (f: F, taskIntentId = f.taskIntentId) => diagnosisEventPending(repos(f), f.scope, taskIntentId);

describe("currentRun", () => {
  it("is the handoff and reading for the intent of the current reading of a confirmed brand", async () => {
    const f = await confirmedHandoff();
    const run = await currentRun(repos(f), f.scope, f.taskIntentId);
    expect(run?.readingId).toBe(f.readingId);
    expect(run?.handoff.id).toBe(f.handoffId);
  });

  it.each([
    ["an unknown intent", async () => uuid()],
    ["an intent of another reading", async (f: F) => requestDiagnosis(f.t, f.scope, f.handoffId, uuid())],
    ["an intent of another handoff", async (f: F) => requestDiagnosis(f.t, f.scope, uuid(), f.readingId)],
  ])("is null for %s", async (_name, make) => {
    const f = await confirmedHandoff();
    expect(await currentRun(repos(f), f.scope, await make(f))).toBeNull();
  });

  it("is null when the handoff is not confirmed (done) or has no reading", async () => {
    const f = await confirmedHandoff();
    await repos(f).handoffs.update(f.scope, f.handoffId, { step: "summary" });
    expect(await currentRun(repos(f), f.scope, f.taskIntentId)).toBeNull();
    await repos(f).handoffs.update(f.scope, f.handoffId, { step: "done", readingId: null });
    expect(await currentRun(repos(f), f.scope, f.taskIntentId)).toBeNull();
  });

  it("is null for an intent that is not a diagnose intent", async () => {
    const f = await confirmedHandoff();
    const event = await repos(f).events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "task.requested",
      payload: { eventName: "equipe.handoff.read", data: { handoffId: f.handoffId, readingId: f.readingId } }, occurredAt: new Date() });
    await repos(f).taskOutbox.create(f.scope, { id: event.id, eventName: "equipe.handoff.read", data: { handoffId: f.handoffId, readingId: f.readingId } });
    expect(await currentRun(repos(f), f.scope, event.id)).toBeNull();
  });

  it("does not see an intent of another account", async () => {
    const t = makeTestDeps();
    const a = await confirmedHandoff(t);
    const b = await confirmedHandoff(t);
    expect(await currentRun(repos(b), b.scope, a.taskIntentId)).toBeNull();
  });
});

describe("diagnosisEventPending", () => {
  it("is true for the current intent with nothing recorded and no failure", async () => {
    expect(await pending(await confirmedHandoff())).toBe(true);
  });

  it("is false once the reading has its diagnosis document", async () => {
    const short = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    expect(await pending(short)).toBe(true);
    await executeCommand(short.t.deps, system(short), { type: "diagnosis_record", payload: { taskIntentId: short.taskIntentId, output: null, model: null, promptVersion: null } });
    expect(await pending(short)).toBe(false);
  });

  it("is false once THAT intent failed, but a newer intent of the same reading is still pending", async () => {
    const f = await confirmedHandoff();
    advancingClock(f.t);
    await command(f, "diagnosis_fail", { taskIntentId: f.taskIntentId, code: "provider_error" });
    expect(await pending(f)).toBe(false);
    const retried = await executeCommand(f.t.deps, { workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver }, { type: "diagnosis_retry", payload: {} });
    const next = (retried.ok ? retried.value.data.taskIntentId : "") as string;
    expect(await pending(f, next)).toBe(true);
    expect(await pending(f)).toBe(false);
  });

  it("is false for a stale intent, an unknown one and an unconfirmed handoff", async () => {
    const f = await confirmedHandoff();
    expect(await pending(f, await requestDiagnosis(f.t, f.scope, f.handoffId, uuid()))).toBe(false);
    expect(await pending(f, uuid())).toBe(false);
    await repos(f).handoffs.update(f.scope, f.handoffId, { step: "images" });
    expect(await pending(f)).toBe(false);
  });
});

describe("diagnoseIntents / eventsFor / diagnosisDocuments / readingOf", () => {
  it("lists the diagnose intents of ONE reading, oldest first", async () => {
    const f = await confirmedHandoff();
    advancingClock(f.t);
    const second = await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId);
    await requestDiagnosis(f.t, f.scope, f.handoffId, uuid());
    const intents = await diagnoseIntents(repos(f), f.scope, f.readingId);
    expect(intents.map(event => event.id)).toEqual([f.taskIntentId, second]);
  });

  it("eventsFor filters by type AND by task intent", async () => {
    const f = await confirmedHandoff();
    const other = await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId);
    await command(f, "diagnosis_fail", { taskIntentId: f.taskIntentId, code: "provider_error" });
    expect(await eventsFor(repos(f), f.scope, "diagnosis.failed", f.taskIntentId)).toHaveLength(1);
    expect(await eventsFor(repos(f), f.scope, "diagnosis.failed", other)).toHaveLength(0);
    expect(await eventsFor(repos(f), f.scope, "diagnosis.started", f.taskIntentId)).toHaveLength(0);
  });

  it("diagnosisDocuments only returns diagnosis documents, by version; readingOf reads the meta", async () => {
    const short = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    await executeCommand(short.t.deps, system(short), { type: "diagnosis_record", payload: { taskIntentId: short.taskIntentId, output: null, model: null, promptVersion: null } });
    const account = await repos(short).accounts.get(short.workspaceId, short.accountId);
    await repos(short).documents.create(short.scope, { clientProfileId: account!.clientProfileId, kind: "other", version: 1, content: {}, createdByRole: "research" });
    const docs = await diagnosisDocuments(repos(short), short.scope);
    expect(docs.map(doc => doc.kind)).toEqual(["diagnosis"]);
    expect(readingOf(docs[0]!)).toBe(short.readingId);
    expect(readingOf({ content: {} })).toBeUndefined();
    expect(readingOf({ content: { meta: {} } })).toBeUndefined();
  });
});

describe("isReadingStuck", () => {
  const groups = (status: string) => ({ name: { runId: "r", taskIntentId: "t", status } });
  it.each([
    [{ step: "reading", readsUsed: 3, reading: groups("failed") }, true],
    [{ step: "source", readsUsed: 3, reading: {} }, true],
    [{ step: "reading", readsUsed: 3, reading: groups("pending") }, false],
    [{ step: "reading", readsUsed: 3, reading: groups("running") }, false],
    [{ step: "reading", readsUsed: 2, reading: groups("failed") }, false],
    [{ step: "identity", readsUsed: 3, reading: groups("failed") }, false],
    [{ step: "done", readsUsed: 3, reading: {} }, false],
  ] as const)("%j → %s", (handoff, expected) => {
    expect(isReadingStuck(handoff as never)).toBe(expected);
  });
});

// The diagnosis that cannot be built because the free credit ended (ticket 13, D-12): the person needs a way out that does not need a model.
describe("diagnosisBlockedByBudget", () => {
  const blocked = (f: F) => diagnosisBlockedByBudget(repos(f), f.scope);
  const fail = (f: F, code: string, taskIntentId = f.taskIntentId) => command(f, "diagnosis_fail", { taskIntentId, code });

  it("is true once the diagnosis of the current reading failed for good because the credit ended, and not before", async () => {
    const f = await confirmedHandoff();
    expect(await blocked(f)).toBe(false);
    await fail(f, "budget_exceeded");
    expect(await blocked(f)).toBe(true);
  });

  it.each(["provider_error", "model_truncated", "diagnosis_invalid", "execution_blocked", "model_refused", "diagnosis_unavailable", "something_new"])(
    "is false for a failure that is not about the credit (%s)", async (code) => {
      const f = await confirmedHandoff();
      await fail(f, code);
      expect(await blocked(f)).toBe(false);
    });

  it("is false when the failure was marked retryable, even with the same code (a try is still on offer)", async () => {
    const f = await confirmedHandoff();
    await repos(f).events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnosis.failed",
      payload: { taskIntentId: f.taskIntentId, code: "budget_exceeded", retryable: true }, occurredAt: new Date() });
    expect(await blocked(f)).toBe(false);
  });

  it("only the LATEST intent of the reading counts", async () => {
    const f = await confirmedHandoff();
    advancingClock(f.t);
    await fail(f, "budget_exceeded");
    expect(await blocked(f)).toBe(true);
    const second = await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId); // a newer run is on its way
    expect(await blocked(f)).toBe(false);
    advancingClock(f.t);
    await fail(f, "provider_error", second);
    expect(await blocked(f)).toBe(false);
    advancingClock(f.t);
    await fail(f, "budget_exceeded", await requestDiagnosis(f.t, f.scope, f.handoffId, f.readingId));
    expect(await blocked(f)).toBe(true);
  });

  it("is false once the reading has its diagnosis, even if an earlier run failed for lack of credit", async () => {
    const short = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    advancingClock(short.t);
    await fail(short, "budget_exceeded");
    expect(await blocked(short)).toBe(true);
    const second = await requestDiagnosis(short.t, short.scope, short.handoffId, short.readingId);
    await executeCommand(short.t.deps, system(short), { type: "diagnosis_record", payload: { taskIntentId: second, output: null, model: null, promptVersion: null } });
    expect(await blocked(short)).toBe(false);
  });

  it("is false when the reading already has its diagnosis document, whatever the events say", async () => {
    const short = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
    await executeCommand(short.t.deps, system(short), { type: "diagnosis_record", payload: { taskIntentId: short.taskIntentId, output: null, model: null, promptVersion: null } });
    await repos(short).events.create(short.scope, { actorType: "system", actorId: "t", actorRole: "system", eventType: "diagnosis.failed",
      payload: { taskIntentId: short.taskIntentId, code: "budget_exceeded", retryable: false }, occurredAt: new Date() });
    expect(await blocked(short)).toBe(false);
  });

  it("is false while the brand is not confirmed, has no reading, or moved to a reading that was not diagnosed yet", async () => {
    const f = await confirmedHandoff();
    await fail(f, "budget_exceeded");
    await repos(f).handoffs.update(f.scope, f.handoffId, { readingId: uuid() });
    expect(await blocked(f)).toBe(false);
    await repos(f).handoffs.update(f.scope, f.handoffId, { readingId: f.readingId, step: "summary" });
    expect(await blocked(f)).toBe(false);
    await repos(f).handoffs.update(f.scope, f.handoffId, { step: "done", readingId: null });
    expect(await blocked(f)).toBe(false);
    await repos(f).handoffs.update(f.scope, f.handoffId, { readingId: f.readingId });
    expect(await blocked(f)).toBe(true);
  });

  it("does not see another account's failure", async () => {
    const t = makeTestDeps();
    const a = await confirmedHandoff(t);
    const b = await confirmedHandoff(t);
    await fail(a, "budget_exceeded");
    expect(await blocked(a)).toBe(true);
    expect(await blocked(b)).toBe(false);
  });

  it("is false for an account without a handoff", async () => {
    const f = await confirmedHandoff();
    expect(await diagnosisBlockedByBudget(repos(f), { workspaceId: f.workspaceId, accountId: uuid() })).toBe(false);
  });
});

