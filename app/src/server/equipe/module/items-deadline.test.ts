import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { ctx, deliverTestBatch, setup } from "./testing/items";

// Fixed clock: 2026-10-05T14:00:00Z. The item limit is scheduled − 2 h.
const PAST_LIMIT = new Date("2026-10-05T15:00:00.000Z");
const FUTURE = new Date("2026-10-09T12:00:00.000Z");

describe("expire_item_deadline", () => {
  it("moves undecided items past the limit to 'perdeu a janela'", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ expired: true });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.window_missed",
      "agent_work.requested",
      "notification.requested",
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("missed_window");
    // Silence never approves: no receipt, no intent.
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("expires adjusting items too, but never approves decided ones", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }, { scheduledFor: PAST_LIMIT }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: itemIds[0]!, category: "fact" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[1]!, expectedVersionHash: versionHashes[1]! },
    });
    const adjusting = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(adjusting.ok).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("missed_window");

    const decided = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[1]! },
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.value.data).toMatchObject({ expired: false, status: "scheduled" });
    expect(decided.value.events).toHaveLength(0);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[1]!);
    expect(receipts).toHaveLength(1);
  });

  it("refuses to expire before the limit and from non-system actors", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{ scheduledFor: FUTURE }] });
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("deadline_not_reached");
    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.error.code).toBe("forbidden_actor");
  });
});

describe("propose_new_schedule", () => {
  it("brings a missed item back to decision with a new version and time", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const versionHash = outcome.value.data.versionHash as string;
    expect(versionHash).not.toBe(versionHashes[0]);
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.rescheduled",
      "notification.requested",
    ]);
    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(item).toMatchObject({
      status: "pending_approval",
      currentVersionHash: versionHash,
      scheduledFor: FUTURE,
      deadlineAt: new Date("2026-10-09T10:00:00.000Z"),
    });

    // The client approves the item at the new time; the receipt pins it.
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHash },
    });
    expect(approved.ok).toBe(true);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts[0]?.objectVersion).toBe(versionHash);
  });

  it("rejects past times, undecided items and client proposers", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: PAST_LIMIT }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "expire_item_deadline",
      payload: { itemId: itemIds[0]! },
    });
    const past = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: new Date("2026-10-01T12:00:00.000Z") },
    });
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error.code).toBe("invalid_schedule");

    const fresh = await deliverTestBatch(t, ids, { items: [{ scheduledFor: FUTURE }] });
    const undecided = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "propose_new_schedule",
      payload: { itemId: fresh.itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(undecided.ok).toBe(false);
    if (!undecided.ok) expect(undecided.error.code).toBe("invalid_transition");

    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "propose_new_schedule",
      payload: { itemId: itemIds[0]!, scheduledFor: FUTURE },
    });
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("forbidden_actor");
  });
});
