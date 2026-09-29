import { seedInstagramConnection } from "./testing/publication";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../domain";
import { publicationIntentIdempotencyKey } from "../data";
import { executeCommand } from "./commands";
import type { BatchItemResult } from "./items-approve";
import { ctx, deliverTestBatch, setup, uuid } from "./testing/items";

describe("approve_item", () => {
  it("approves the exact version: scheduled + intent + receipt + events", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "item.approved",
      "notification.requested",
    ]);

    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(item?.status).toBe("scheduled");
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personRole: "approver",
      objectVersion: versionHashes[0],
      action: "approve_item",
    });
    const intent = await t.deps.uow.repos.intents.getByItemVersion(
      scope,
      itemIds[0]!,
      versionHashes[0]!,
    );
    expect(intent).toMatchObject({
      status: "pending",
      idempotencyKey: publicationIntentIdempotencyKey(itemIds[0]!, versionHashes[0]!),
    });
  });

  it("rejects a stale hash with 'mudou desde que você abriu'", async () => {
    const { t, ids } = await setup();
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: "versão-antiga" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("version_mismatch");
    expect(outcome.error.message).toMatch("mudou desde que você abriu");
  });

  it("first receipt wins: the substitute's second approval is a no-op", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(first.ok).toBe(true);
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ alreadyApproved: true });
    expect(second.value.events).toHaveLength(0);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.personRole).toBe("approver");
  });

  it("substitute approves under their own name", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(outcome.ok).toBe(true);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts[0]).toMatchObject({ personRole: "substitute" });
  });

  it("manual mode approves to available_for_download with no intent", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const agreed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "agree_manual_mode",
      payload: {},
    });
    expect(agreed.ok).toBe(true);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(outcome.ok).toBe(true);
    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(item?.status).toBe("available_for_download");
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("agent cannot approve, and members cannot approve", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    for (const actor of [ids.actors.agent, ids.actors.member, ids.actors.support]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "approve_item",
        payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) continue;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("individually approves an item that asks for confirmation", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ caption: "50% off hoje", needsConfirmation: true }],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(outcome.ok).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("scheduled");
  });

  it("rejects approval at the exact item deadline without writing a receipt or intent", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    t.deps.clock = fixedClock(new Date("2026-10-09T10:00:00.000Z"));
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "item_limit_passed" } });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("reports an expired entry inside approve_batch", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    t.deps.clock = fixedClock(new Date("2026-10-09T10:00:00.000Z"));
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_batch",
      payload: { items: [{ itemId: itemIds[0]!, versionHash: versionHashes[0]! }] },
    });
    expect(outcome).toMatchObject({
      ok: true,
      value: { data: { results: [{ outcome: "not_ready", code: "item_limit_passed" }] } },
    });
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("does not treat a cancelled item's approval receipt as an idempotent approval", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    expect((await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    })).ok).toBe(true);
    expect((await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "cancel_scheduled", payload: { itemId: itemIds[0]! },
    })).ok).toBe(true);
    const retry = await executeCommand(t.deps, ctx(ids, ids.actors.substitute), {
      type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(retry).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("cancelled");
    expect(await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(2);
  });
});

describe("approve_batch", () => {
  it("approves a closed list with a per-item result", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);

    // One item leaves "pronto": the client edits it, revalidation pending.
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[1]!, caption: "nova legenda" },
    });
    expect(edited.ok).toBe(true);

    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_batch",
      payload: {
        items: [
          { itemId: itemIds[0]!, versionHash: versionHashes[0]! },
          { itemId: itemIds[1]!, versionHash: versionHashes[1]! },
        ],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const results = outcome.value.data.results as BatchItemResult[];
    expect(results).toMatchObject([
      { itemId: itemIds[0], outcome: "approved" },
      // Stale hash (edit moved the version) — rejected per item.
      { itemId: itemIds[1], outcome: "changed_since_opened" },
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("scheduled");
  });

  it("rejects not-ready, already-decided and foreign items per item", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{}, {}, { needsConfirmation: true }],
    });
    // Pre-approve the first item so the batch sees it as already decided.
    const pre = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    expect(pre.ok).toBe(true);

    const foreignId = uuid();
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_batch",
      payload: {
        items: [
          { itemId: itemIds[0]!, versionHash: versionHashes[0]! },
          { itemId: itemIds[1]!, versionHash: versionHashes[1]! },
          { itemId: itemIds[2]!, versionHash: versionHashes[2]! },
          { itemId: foreignId, versionHash: "hash-qualquer" },
        ],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const results = outcome.value.data.results as BatchItemResult[];
    expect(results).toMatchObject([
      { itemId: itemIds[0], outcome: "already_decided" },
      { itemId: itemIds[1], outcome: "approved" },
      // "Pede confirmação" needs an individual decision — never the batch.
      { itemId: itemIds[2], outcome: "not_ready", reviewStatus: "needs_confirmation" },
      { itemId: foreignId, outcome: "unknown_item" },
    ]);
    const receipts = await t.deps.uow.repos.receipts.listByObject(
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      "item",
      itemIds[0]!,
    );
    expect(receipts).toHaveLength(1);
  });

  it("approves nothing when every entry is stale", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_batch",
      payload: { items: [{ itemId: itemIds[0]!, versionHash: "velho" }] },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data.results).toMatchObject([
      { itemId: itemIds[0], outcome: "changed_since_opened" },
    ]);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
  });
});
