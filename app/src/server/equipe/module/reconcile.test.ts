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

  it("does not treat matching caption/time as proof when no provider id is known", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await dispatchTimeout(t, ids);
    t.publisher.recentMedia = [
      {
        externalId: "ig_media_found",
        igUserId: "ig_test_brand",
        caption: "legenda 1",
        permalink: "https://instagram.test/p/found",
        takenAt: new Date("2026-10-05T14:00:00.000Z"),
      },
      {
        externalId: "ig_media_same_caption",
        igUserId: "ig_test_brand",
        caption: "legenda 1",
        permalink: "https://instagram.test/p/also-found",
        takenAt: new Date("2026-10-05T14:00:01.000Z"),
      },
    ];
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "still_verifying" });
    expect(t.publisher.lookups).toHaveLength(1);
    expect(t.publisher.lookups[0]).toMatchObject({
      caption: "legenda 1", containerId: "container_1", destinationIgUserId: "ig_test_brand",
    });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("verifying");
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemId);
    expect(receipts.some((r) => r.action === "dispatch_publication")).toBe(false);
  });

  it("confirms only a known provider media id on the pinned Instagram identity", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await dispatchTimeout(t, ids);
    await t.deps.uow.repos.intents.update(scope, intentId, { externalId: "known_media" });
    t.publisher.recentMedia = [
      { externalId: "other_media", igUserId: "ig_test_brand", caption: "legenda 1", permalink: null, takenAt: new Date() },
      { externalId: "known_media", igUserId: "wrong_ig", caption: "legenda 1", permalink: null, takenAt: new Date() },
    ];
    const wrongDestination = await reconcileOf(t, ids, itemId);
    expect(wrongDestination.ok && wrongDestination.value.data).toMatchObject({ reconciled: false });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    t.publisher.recentMedia.push({
      externalId: "known_media", igUserId: "ig_test_brand", caption: "legenda 1", permalink: null, takenAt: new Date(),
    });
    const outcome = await reconcileOf(t, ids, itemId);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: true, externalId: "known_media" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("published");
  });

  it("ignores uncorrelated media regardless of its age", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId } = await dispatchTimeout(t, ids);
    t.publisher.recentMedia = [
      {
        externalId: "ig_media_old",
        igUserId: "ig_test_brand",
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

  it.each([false, true])("escalates once after 1 h, without resending (lookup fails: %s)", async (lookupFails) => {
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
    if (lookupFails) t.publisher.findRecentMedia = async () => { throw new Error("graph down"); };
    const cause = lookupFails ? "lookup_failed" : "publication_proof_missing";
    const first = await reconcileOf(t, ids, itemIds[0]!);
    const second = await reconcileOf(t, ids, itemIds[0]!);
    expect(first.ok && first.value.data).toMatchObject({ reconciled: false, reason: "escalated", cause });
    expect(second.ok && second.value.data).toMatchObject({ reconciled: false, reason: "escalated", cause });
    const escalations = await t.deps.uow.repos.escalations.list(scope);
    expect(escalations).toHaveLength(1);
    expect(escalations[0]).toMatchObject({ kind: "technical", ownerRole: "operations", itemId: itemIds[0] });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("verifying");
    expect((await t.deps.uow.repos.intents.get(scope, intent!.id))?.status).toBe("verifying");
    expect((await t.deps.uow.repos.intents.get(scope, intent!.id))?.lastError).toBe(cause);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts.some((receipt) => receipt.action === "dispatch_publication")).toBe(false);
    await t.deps.uow.repos.escalations.update(scope, escalations[0]!.id, { status: "resolved" });
    await reconcileOf(t, ids, itemIds[0]!);
    const afterResolve = await t.deps.uow.repos.escalations.list(scope);
    expect(afterResolve).toHaveLength(1);
    expect(afterResolve[0]?.status).toBe("resolved");
    const dispatch = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication", payload: { intentId: intent!.id },
    });
    expect(dispatch.ok && dispatch.value.data).toMatchObject({ action: "none", status: "verifying" });
    expect(t.publisher.creates).toHaveLength(0);
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("records a failed lookup while keeping the item verifying", async () => {
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
    const intent = await t.deps.uow.repos.intents.getByItemVersion(
      scope, itemId, (await t.deps.uow.repos.items.get(scope, itemId))!.currentVersionHash!,
    );
    expect(intent?.lastError).toBe("lookup_failed");
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

  it("keeps a manual declaration pending human verification even if caption matches", async () => {
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
        igUserId: "ig_test_brand",
        caption: "legenda 1",
        permalink: "https://instagram.test/p/manual",
        takenAt: new Date("2026-10-05T13:00:00.000Z"),
      },
    ];
    const outcome = await reconcileOf(t, ids, itemIds[0]!);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "human_verification_required" });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("published_declared");
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
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "human_verification_required" });
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
    expect(outcome.value.data).toMatchObject({ reconciled: false, reason: "human_verification_required" });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("published_declared");
    expect(await t.deps.uow.repos.escalations.list(scope)).toHaveLength(0);
  });
});
