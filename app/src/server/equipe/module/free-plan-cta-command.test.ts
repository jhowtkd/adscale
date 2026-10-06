// PR 626 review, F7: what the free plan's CTA sends, against the REAL request_support command (in-memory store).
// The CTA asks the PLAN only once the plan can be asked (a recorded diagnosis); before that it asks a person with the
// plan note. Both sides of that rule are pinned here, with the very note the client sends.
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { DIAGNOSTIC_RECORDED_EVENT } from "../agents/free-budget";
import { PLAN_PERSON_NOTE } from "@/lib/equipe/use-plan-request";
import { ctx, setup, type ItemIds, type TestDeps } from "./testing/items";

const scopeOf = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });
const send = (t: TestDeps, ids: ItemIds, payload: Record<string, unknown>) =>
  executeCommand(t.deps, ctx(ids, ids.actors.member), { type: "request_support", payload } as never);

describe("the free plan CTA against request_support", () => {
  it("a free account without a diagnosis: the plan request is refused (invalid_transition) and writes no exception", async () => {
    const { t, ids } = await setup();

    const outcome = await send(t, ids, { purpose: "plan" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
    expect(await t.deps.uow.repos.exceptions.list(scopeOf(ids))).toHaveLength(0);
  });

  it("the same account, the CTA's person request (no purpose, plan note): accepted, exactly 1 client_requested_person exception with the note", async () => {
    const { t, ids } = await setup();

    const outcome = await send(t, ids, { note: PLAN_PERSON_NOTE });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const rows = await t.deps.uow.repos.exceptions.list(scopeOf(ids));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: outcome.value.data.exceptionId, trigger: "client_requested_person" });
    const opened = outcome.value.events.find((event) => event.eventType === "support_exception.opened");
    expect(opened?.payload).toMatchObject({ reason: PLAN_PERSON_NOTE });
    expect(opened?.payload).not.toMatchObject({ purpose: "plan" });
  });

  // KNOWN DEFECT (reported, production code untouched): only `purpose: "plan"` joins an open exception; the person request
  // opens a NEW client_requested_person each time. Only the client flag (lost on reload) keeps the CTA from sending twice.
  it("repeating the person request is idempotent: still 1 exception, and the same one comes back", async () => {
    const { t, ids } = await setup();

    const first = await send(t, ids, { note: PLAN_PERSON_NOTE });
    const second = await send(t, ids, { note: PLAN_PERSON_NOTE });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.data.exceptionId).toBe(first.value.data.exceptionId);
    expect(await t.deps.uow.repos.exceptions.list(scopeOf(ids))).toHaveLength(1);
  });

  it("a free account with a recorded diagnosis: the plan request is accepted, as out_of_contract_request with purpose plan", async () => {
    const { t, ids } = await setup();
    await t.deps.uow.repos.events.create(scopeOf(ids), {
      actorType: "system", actorId: "diag", actorRole: "system",
      eventType: DIAGNOSTIC_RECORDED_EVENT, payload: { documentId: "doc-1" }, occurredAt: t.deps.clock.now(),
    });

    const outcome = await send(t, ids, { purpose: "plan" });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const rows = await t.deps.uow.repos.exceptions.list(scopeOf(ids));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trigger: "out_of_contract_request" });
    expect(outcome.value.events.find((event) => event.eventType === "support_exception.opened")?.payload).toMatchObject({ purpose: "plan" });
  });
});
