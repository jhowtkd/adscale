import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  approveLiveMandate,
  ctx,
  deliverDueApprovedItem,
  deliverTestBatch,
  approveTestItem,
  makeTestDeps,
  openTestAccount,
  seedInstagramConnection,
  setup,
  type ItemIds,
  type TestDeps,
} from "./testing/publication";

async function setupReady() {
  const { t, ids } = await setup();
  await approveLiveMandate(t, ids);
  await seedInstagramConnection(t, ids);
  return { t, ids };
}

function scopeOf(ids: ItemIds) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

async function reconcileOf(t: TestDeps, ids: ItemIds, itemId: string) {
  return executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "reconcile_publication",
    payload: { itemId },
  });
}

async function dispatchTimeout(t: TestDeps, ids: ItemIds): Promise<{ itemId: string; intentId: string }> {
  t.publisher.failNext("publish", { kind: "uncertain" });
  const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
    type: "dispatch_publication",
    payload: { intentId },
  });
  if (!outcome.ok) throw new Error(`setup dispatch failed: ${outcome.error.code}`);
  return { itemId, intentId };
}

describe("reconcile_publication", () => {
  it("only the system job reconciles", async () => {
    const { t, ids } = await setupReady();
    const { itemId } = await dispatchTimeout(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "reconcile_publication",
      payload: { itemId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("forbidden_actor");
  });

  it("finds the media by caption and publishes with the external id", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await dispatchTimeout(t, ids);
    t.publisher.recentMedia = [
      {
        externalId: "ig_media_found",
        caption: "legenda 1",
        permalink: "https://instagram.test/p/found",
        takenAt: new Date("2026-10-05T14:00:00.000Z"),
      },
    ];
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: true, externalId: "ig_media_found" });
    expect(t.publisher.lookups).toHaveLength(1);
    expect(t.publisher.lookups[0]).toMatchObject({ caption: "legenda 1", containerId: "container_1" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("published");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("published");
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemId);
    expect(receipts.some((r) => r.action === "dispatch_publication")).toBe(true);
  });

  it("ignores stale media outside the send window", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId } = await dispatchTimeout(t, ids);
    t.publisher.recentMedia = [
      {
        externalId: "ig_media_old",
        caption: "legenda 1",
        permalink: null,
        takenAt: new Date("2026-10-01T14:00:00.000Z"),
      },
    ];
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "still_verifying" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
  });

  it("stays verifying when the lookup is empty and fresh", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await dispatchTimeout(t, ids);
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "still_verifying" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    const intent = await t.deps.uow.repos.intents.get(scope, intentId);
    expect(intent?.nextAttemptAt).toBeInstanceOf(Date);
    expect(await t.deps.uow.repos.escalations.list(scope)).toHaveLength(0);
  });

  it("not found within 1 h opens a technical escalation and fails the item", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-05T13:00:00.000Z") }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const old = new Date("2026-10-05T12:00:00.000Z");
    await t.deps.uow.repos.items.update(scope, itemIds[0]!, { status: "verifying" });
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!);
    await t.deps.uow.repos.intents.update(scope, intent!.id, { status: "verifying", containerId: "container_1" });
    await t.deps.uow.repos.events.create(scope, {
      actorType: "system",
      actorId: "dispatch",
      actorRole: "system",
      eventType: "item.uncertain",
      objectType: "item",
      objectId: itemIds[0]!,
      payload: { step: "publish", containerId: "container_1" },
      occurredAt: old,
    });
    const outcome = await reconcileOf(t, ids, itemIds[0]!);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "escalated" });
    const escalations = await t.deps.uow.repos.escalations.list(scope);
    expect(escalations).toHaveLength(1);
    expect(escalations[0]).toMatchObject({
      kind: "technical",
      ownerRole: "operations",
      itemId: itemIds[0],
    });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("failed");
    expect((await t.deps.uow.repos.intents.get(scope, intent!.id))?.status).toBe("failed");
  });

  it("a failed lookup changes nothing", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId } = await dispatchTimeout(t, ids);
    t.publisher.findRecentMedia = async () => {
      throw new Error("graph down");
    };
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "lookup_failed" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
  });

  it("ignores items that are not verifying or declared", async () => {
    const { t, ids } = await setupReady();
    const { itemId } = await deliverDueApprovedItem(t, ids);
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "scheduled" });
    expect(t.publisher.lookups).toHaveLength(0);
  });

  it("confirms a manual declaration by reading the account", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = scopeOf(ids);
    await seedInstagramConnection(t, ids);
    const agreed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "agree_manual_mode",
      payload: {},
    });
    expect(agreed.ok).toBe(true);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const declared = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(declared.ok).toBe(true);
    t.publisher.recentMedia = [
      {
        externalId: "ig_media_manual",
        caption: "legenda 1",
        permalink: "https://instagram.test/p/manual",
        takenAt: new Date("2026-10-05T13:00:00.000Z"),
      },
    ];
    const outcome = await reconcileOf(t, ids, itemIds[0]!);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: true, externalId: "ig_media_manual" });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("published_confirmed");
  });

  it("without a read connection a declaration stays declared", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = scopeOf(ids);
    const agreed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "agree_manual_mode",
      payload: {},
    });
    expect(agreed.ok).toBe(true);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const declared = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    expect(declared.ok).toBe(true);
    const outcome = await reconcileOf(t, ids, itemIds[0]!);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "no_read_connection" });
    expect(t.publisher.lookups).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("published_declared");
  });

  it("an unconfirmed declaration is not an escalation", async () => {
    const t = makeTestDeps();
    const ids = await openTestAccount(t);
    const scope = scopeOf(ids);
    await seedInstagramConnection(t, ids);
    const agreed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "agree_manual_mode",
      payload: {},
    });
    expect(agreed.ok).toBe(true);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids);
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "declare_manual_publication",
      payload: { itemId: itemIds[0]! },
    });
    const outcome = await reconcileOf(t, ids, itemIds[0]!);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "not_found_yet" });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("published_declared");
    expect(await t.deps.uow.repos.escalations.list(scope)).toHaveLength(0);
  });
});
