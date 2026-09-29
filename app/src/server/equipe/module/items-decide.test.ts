import { seedInstagramConnection } from "./testing/publication";
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getItemDetail } from "./queries";
import { ctx, deliverTestBatch, setup } from "./testing/items";

describe("confirm_business_fact", () => {
  it("confirms the fact with a receipt and clears 'pede confirmação'", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ caption: "retirada na loja", needsConfirmation: true }],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_business_fact",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "business_fact.confirmed",
      "notification.requested",
    ]);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      action: "confirm_business_fact",
      objectVersion: versionHashes[0],
    });
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.review.status).toBe("ready");
  });

  it("confirms a triaged permanent fact; second confirm is a no-op", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "abrimos às 9h" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["permanent_fact"] },
    });
    const current = (await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.currentVersionHash;
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "confirm_business_fact",
      payload: { itemId: itemIds[0]!, expectedVersionHash: current! },
    });
    expect(first.ok).toBe(true);
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_business_fact",
      payload: { itemId: itemIds[0]!, expectedVersionHash: current! },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ alreadyConfirmed: true });
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts).toHaveLength(1);
  });

  it("refuses to confirm ready or stale versions", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const ready = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_business_fact",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(ready.ok).toBe(false);
    if (ready.ok) return;
    expect(ready.error.code).toBe("nothing_to_confirm");
    const stale = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_business_fact",
      payload: { itemId: itemIds[0]!, expectedVersionHash: "velho" },
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe("version_mismatch");
  });
});

describe("decline_publish", () => {
  it("drops the item from the calendar with a reason and asks for a substitute", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "decline_publish",
      payload: { itemId: itemIds[0]!, reason: "fora da campanha" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.declined",
      "agent_work.requested",
      "notification.requested",
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("do_not_publish");
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.action).toBe("decline_publish");
  });

  it("cannot decline a scheduled item", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "decline_publish",
      payload: { itemId: itemIds[0]!, reason: "tarde demais" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
  });
});

describe("cancel_scheduled", () => {
  it("cancels before dispatch and voids the intent", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "cancel_scheduled",
      payload: { itemId: itemIds[0]! },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.cancelled",
      "notification.requested",
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("cancelled");
    const intent = await t.deps.uow.repos.intents.getByItemVersion(
      scope,
      itemIds[0]!,
      versionHashes[0]!,
    );
    expect(intent?.status).toBe("canceled");
    expect(outcome.value.data).toMatchObject({ voidedIntentId: intent?.id });
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts.map((r) => r.action).sort()).toEqual(["approve_item", "cancel_scheduled"]);
  });

  it("cannot cancel an undecided item", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "cancel_scheduled",
      payload: { itemId: itemIds[0]! },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
  });
});

describe("decline vs cancel", () => {
  it("stores distinct states: do_not_publish for decline, cancelled for cancel", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "decline_publish",
      payload: { itemId: itemIds[0]!, reason: "fora da campanha" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[1]!, expectedVersionHash: versionHashes[1]! },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "cancel_scheduled",
      payload: { itemId: itemIds[1]! },
    });
    const declined = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    const cancelled = await t.deps.uow.repos.items.get(scope, itemIds[1]!);
    expect(declined?.status).toBe("do_not_publish");
    expect(cancelled?.status).toBe("cancelled");
    expect(declined?.status).not.toBe(cancelled?.status);
  });
});
