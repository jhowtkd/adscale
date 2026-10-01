// getAccountState.planAvailable (ticket 08): the same gate request_support(plan) uses.

import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getAccountState } from "./queries";
import { makeTestDeps, uuid } from "./testing/deps";
import { advancingClock, confirmedHandoff, requestDiagnosis } from "./testing/diagnosis";
import { HANDOFF_DIAGNOSE_EVENT } from "../handoff/contract";

const JOB = { kind: "system", job: HANDOFF_DIAGNOSE_EVENT } as const;
type F = Awaited<ReturnType<typeof confirmedHandoff>>;
const available = async (f: F) => (await getAccountState(f.t.deps.uow.repos, f.workspaceId, f.accountId))?.planAvailable;
const asJob = (f: F) => ({ workspaceId: f.workspaceId, accountId: f.accountId, actor: JOB });
const asApprover = (f: F) => ({ workspaceId: f.workspaceId, accountId: f.accountId, actor: f.approver });

async function insufficient() {
  const f = await confirmedHandoff(makeTestDeps(), { site: "Café Aurora. Torra própria.", instagram: null });
  advancingClock(f.t);
  await executeCommand(f.t.deps, asJob(f), { type: "diagnosis_claim", payload: { taskIntentId: f.taskIntentId } });
  await executeCommand(f.t.deps, asJob(f), { type: "diagnosis_record", payload: { taskIntentId: f.taskIntentId, output: null, model: null, promptVersion: null } });
  return f;
}

describe("getAccountState.planAvailable", () => {
  it("is false without a diagnosis and true once one is recorded", async () => {
    const f = await confirmedHandoff();
    expect(await available(f)).toBe(false);
    const short = await insufficient();
    expect(await available(short)).toBe(true);
  });

  it("a failed diagnosis does not make the plan available", async () => {
    const f = await confirmedHandoff();
    await executeCommand(f.t.deps, asJob(f), { type: "diagnosis_fail", payload: { taskIntentId: f.taskIntentId, code: "provider_error" } });
    expect(await available(f)).toBe(false);
  });

  it("is FALSE during a live correction (reopened), TRUE after the restore", async () => {
    const f = await insufficient();
    expect((await executeCommand(f.t.deps, asApprover(f), { type: "diagnosis_correct_source", payload: {} })).ok).toBe(true);
    expect(await available(f)).toBe(false);
    expect((await executeCommand(f.t.deps, asApprover(f), { type: "diagnosis_restore_previous", payload: {} })).ok).toBe(true);
    expect(await available(f)).toBe(true);
  });

  it("is TRUE again when the correction has no way out: the reading ran out of attempts", async () => {
    const f = await insufficient();
    await executeCommand(f.t.deps, asApprover(f), { type: "diagnosis_correct_source", payload: {} });
    expect(await available(f)).toBe(false);
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "source", readsUsed: 3 });
    expect(await available(f)).toBe(true);
  });

  it("is TRUE again when the replacement diagnosis failed for good", async () => {
    const f = await insufficient();
    await executeCommand(f.t.deps, asApprover(f), { type: "diagnosis_correct_source", payload: {} });
    const readingId = uuid();
    await f.t.deps.uow.repos.handoffs.update(f.scope, f.handoffId, { step: "done", readingId, readsUsed: 2 });
    const intent = await requestDiagnosis(f.t, f.scope, f.handoffId, readingId);
    expect(await available(f)).toBe(false);
    await executeCommand(f.t.deps, asJob(f), { type: "diagnosis_fail", payload: { taskIntentId: intent, code: "provider_error" } });
    expect(await available(f)).toBe(false); // retryable: "Tentar de novo" is still offered
    await executeCommand(f.t.deps, asJob(f), { type: "diagnosis_fail", payload: { taskIntentId: await requestDiagnosis(f.t, f.scope, f.handoffId, readingId), code: "budget_exceeded" } });
    expect(await available(f)).toBe(true);
  });

  it("follows request_support(plan): available ⇔ the request is accepted", async () => {
    const f = await insufficient();
    await executeCommand(f.t.deps, asApprover(f), { type: "diagnosis_correct_source", payload: {} });
    expect(await available(f)).toBe(false);
    const refused = await executeCommand(f.t.deps, asApprover(f), { type: "request_support", payload: { purpose: "plan" } });
    expect(refused.ok).toBe(false);
    await executeCommand(f.t.deps, asApprover(f), { type: "diagnosis_restore_previous", payload: {} });
    expect(await available(f)).toBe(true);
    expect((await executeCommand(f.t.deps, asApprover(f), { type: "request_support", payload: { purpose: "plan" } })).ok).toBe(true);
  });

  it("is absent for an unknown account (null state)", async () => {
    const f = await confirmedHandoff();
    expect(await getAccountState(f.t.deps.uow.repos, uuid(), uuid())).toBeNull();
  });
});
