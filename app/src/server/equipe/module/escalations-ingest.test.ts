import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { ctx, deliverTestBatch, setup, type ItemIds } from "./testing/items";

const SCOPE = (ids: ItemIds) => ({ workspaceId: ids.workspaceId, accountId: ids.accountId });

async function seedSignal(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: ItemIds,
  input: { eventType: string; objectType?: string; objectId?: string; payload?: unknown },
): Promise<string> {
  const event = await t.deps.uow.repos.events.create(SCOPE(ids), {
    actorType: "agent",
    actorId: "estrategista",
    actorRole: "agent",
    eventType: input.eventType,
    objectType: input.objectType,
    objectId: input.objectId,
    payload: input.payload ?? null,
    occurredAt: new Date("2026-10-05T14:00:00.000Z"),
  });
  return event.id;
}

describe("ingest_agent_signal", () => {
  it("turns escalation.requested into an escalation row, once", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const sourceEventId = await seedSignal(t, ids, {
      eventType: "escalation.requested",
      objectType: "item",
      objectId: itemIds[0]!,
      payload: {
        reason: "regulated_claim",
        severity: "high",
        ownerRole: "quality",
        versionHash: "v1",
      },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.ingested).toBe("escalation");
    const row = await t.deps.uow.repos.escalations.get(
      scope,
      outcome.value.data.escalationId as string,
    );
    expect(row).toMatchObject({
      kind: "content",
      severity: "medium",
      status: "open",
      ownerRole: "quality",
      itemId: itemIds[0],
    });
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId },
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.data).toMatchObject({ duplicate: true, rowId: row?.id });
    expect(await t.deps.uow.repos.escalations.list(scope)).toHaveLength(1);
  });

  it("turns agent.turn_failed into an automatic technical escalation", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const sourceEventId = await seedSignal(t, ids, {
      eventType: "agent.turn_failed",
      payload: { taskKind: "research", error: "model timeout" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.ingested).toBe("escalation");
    const row = await t.deps.uow.repos.escalations.get(
      scope,
      outcome.value.data.escalationId as string,
    );
    expect(row).toMatchObject({
      kind: "technical",
      severity: "medium",
      status: "open",
      ownerRole: "operations",
    });
    expect(row?.dueAt).toEqual(new Date("2026-10-06T14:00:00.000Z"));
    const opened = outcome.value.events.find((e) => e.eventType === "escalation.opened");
    expect(opened?.payload).toMatchObject({
      reason: "agent.turn_failed research: model timeout",
      origin: "auto",
      sourceEventId,
    });
    // No support exception: a failed turn is operations work, not atendimento.
    expect(await t.deps.uow.repos.exceptions.list(scope)).toHaveLength(0);
  });

  it("honors a critical turn_failed when the signal points at an item", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const { itemIds } = await deliverTestBatch(t, ids);
    const sourceEventId = await seedSignal(t, ids, {
      eventType: "agent.turn_failed",
      objectType: "item",
      objectId: itemIds[0]!,
      payload: { taskKind: "writing", error: "tool blew up", severity: "critical" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const row = await t.deps.uow.repos.escalations.get(
      scope,
      outcome.value.data.escalationId as string,
    );
    expect(row).toMatchObject({
      kind: "technical",
      severity: "critical",
      ownerRole: "operations",
      itemId: itemIds[0],
    });
    // Critical still pauses the front through the shared open path.
    const pauses = await t.deps.uow.repos.pauses.list(scope);
    expect(pauses.some((p) => p.origin === "content_incident" && p.status === "active")).toBe(true);
  });

  it("turns agent.budget_exceeded into a commercial exception", async () => {
    const { t, ids } = await setup();
    const scope = SCOPE(ids);
    const sourceEventId = await seedSignal(t, ids, {
      eventType: "agent.budget_exceeded",
      payload: { totalCostUsdCents: 5100, budgetUsdCents: 5000, taskKind: "writing" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const row = await t.deps.uow.repos.exceptions.get(
      scope,
      outcome.value.data.exceptionId as string,
    );
    expect(row?.trigger).toBe("out_of_contract_request");
    expect(row?.reason).toContain("5100/5000");
  });

  it("rejects unknown signals, bad pointers and non-system callers", async () => {
    const { t, ids } = await setup();
    const other = await seedSignal(t, ids, { eventType: "item.approved", payload: {} });
    const unknown = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId: other },
    });
    expect(unknown.ok).toBe(false);
    const missing = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "ingest_agent_signal",
      payload: { sourceEventId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(missing.ok).toBe(false);
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "ingest_agent_signal",
      payload: { sourceEventId: other },
    });
    expect(agent.ok).toBe(false);
    if (!agent.ok) expect(agent.error.code).toBe("forbidden_actor");
  });
});
