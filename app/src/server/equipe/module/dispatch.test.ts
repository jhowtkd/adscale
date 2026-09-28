import { describe, expect, it } from "vitest";
import type { EquipeRepositories, InternalEquipeRepositories } from "../data";
import { executeCommand } from "./commands";
import {
  approveLiveMandate,
  approveTestItem,
  ctx,
  deliverDueApprovedItem,
  deliverTestBatch,
  dueScheduledFor,
  intentOf,
  makeTestDeps,
  openTestAccount,
  seedInstagramConnection,
  setup,
} from "./testing/publication";

async function setupReady() {
  const { t, ids } = await setup();
  await approveLiveMandate(t, ids);
  await seedInstagramConnection(t, ids);
  return { t, ids };
}

function scopeOf(ids: { workspaceId: string; accountId: string }) {
  return { workspaceId: ids.workspaceId, accountId: ids.accountId };
}

describe("dispatch_publication", () => {
  it("publishes a due item in two steps with the container persisted between them", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "published", itemId, intentId });
    expect(t.publisher.creates).toHaveLength(1);
    expect(t.publisher.publishes).toHaveLength(1);
    expect(t.publisher.publishes[0]!.containerId).toBe("container_1");

    const item = await t.deps.uow.repos.items.get(scope, itemId);
    expect(item?.status).toBe("published");
    const intent = await t.deps.uow.repos.intents.get(scope, intentId);
    expect(intent).toMatchObject({
      status: "published",
      containerId: "container_1",
      externalId: "ig_media_1",
    });
    expect(intent?.publishedAt).toBeInstanceOf(Date);
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemId);
    const dispatchReceipt = receipts.find((r) => r.action === "dispatch_publication");
    expect(dispatchReceipt?.detail).toMatchObject({
      externalId: "ig_media_1",
      containerId: "container_1",
    });
    expect(outcome.value.events.map((e) => e.eventType)).toContain("item.published");
  });

  it("is idempotent: double dispatch of the same intent sends once", async () => {
    const { t, ids } = await setupReady();
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(first.ok).toBe(true);
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toMatchObject({ action: "already_published" });
    expect(t.publisher.creates).toHaveLength(1);
    expect(t.publisher.publishes).toHaveLength(1);
  });

  it("only the system job dispatches", async () => {
    const { t, ids } = await setupReady();
    const { intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("forbidden_actor");
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("refuses unknown intents and intents that are not due", async () => {
    const { t, ids } = await setupReady();
    const unknown = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(unknown.ok).toBe(false);

    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await intentOf(t, ids, itemIds[0]!, versionHashes[0]!);
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: intent.id },
    });
    expect(early.ok).toBe(true);
    if (!early.ok) return;
    expect(early.value.data).toMatchObject({ action: "not_due" });
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it("cancels a stale intent instead of sending the old version", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, versionHash, intentId } = await deliverDueApprovedItem(t, ids);
    // Race seam: a new current version landed without voiding the intent
    // (the edit commands void it themselves; this is the backstop).
    await t.deps.uow.repos.items.update(scope, itemId, { currentVersionHash: "versão-nova" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "stale" });
    expect(t.publisher.publishes).toHaveLength(0);
    const intent = await t.deps.uow.repos.intents.get(scope, intentId);
    expect(intent?.status).toBe("canceled");
    expect(versionHash).not.toBe("versão-nova");
  });

  it("a definitive refusal fails the item and keeps the container", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    t.publisher.publishBehavior = { kind: "fail", message: "o Instagram recusou a legenda" };
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "failed", step: "publish" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("failed");
    const intent = await t.deps.uow.repos.intents.get(scope, intentId);
    expect(intent).toMatchObject({ status: "failed", containerId: "container_1" });
    expect(intent?.lastError).toContain("recusou");
  });

  it("an expired token flips the connection and pauses publications", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    t.publisher.publishBehavior = { kind: "fail", code: "connection_expired" };
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    // A second scheduled item shows the connection pause holding the rest.
    const second = await deliverDueApprovedItem(t, ids, { caption: "legenda 2" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "failed", code: "connection_expired" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("failed");

    const connections = await t.deps.uow.repos.connections.list(scope);
    expect(connections[0]?.status).toBe("expired");
    expect(connections[0]?.lastError).toContain("expirou");
    const pauses = await t.deps.uow.repos.pauses.list(scope);
    expect(pauses.some((p) => p.status === "active" && p.origin === "connection")).toBe(true);
    expect((await t.deps.uow.repos.items.get(scope, second.itemId))?.status).toBe("held");
  });

  it("a timeout on publish goes to verifying with the container stored", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    t.publisher.failNext("publish", { kind: "uncertain" });
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "verifying", step: "publish" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    const intent = await t.deps.uow.repos.intents.get(scope, intentId);
    expect(intent).toMatchObject({ status: "verifying", containerId: "container_1" });
  });

  it("a timeout on create goes to verifying without a container", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    t.publisher.failNext("create", { kind: "uncertain" });
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "verifying", step: "create" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.containerId).toBeNull();
  });

  it("a retry reuses the stored container and never creates another", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    // Crash between persisting the container and publishing: the intent is
    // back to sending with the container stored (the job re-claimed it).
    await t.deps.uow.repos.items.update(scope, itemId, { status: "sending" });
    await t.deps.uow.repos.intents.update(scope, intentId, {
      status: "sending",
      containerId: "container_kept",
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "published" });
    expect(t.publisher.creates).toHaveLength(0);
    expect(t.publisher.publishes).toHaveLength(1);
    expect(t.publisher.publishes[0]!.containerId).toBe("container_kept");
  });

  it("a crash after publish retries into verifying and never publishes twice", async () => {
    const { t, ids } = await setupReady();
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);

    // Crash AFTER publishContainer succeeded but BEFORE the "done"
    // transaction: the first unit of work after the publish throws.
    const innerRun = t.deps.uow.run.bind(t.deps.uow);
    let crashed = false;
    t.deps.uow.run = async <T,>(
      fn: (repos: EquipeRepositories, internal: InternalEquipeRepositories) => Promise<T>,
    ): Promise<T> => {
      if (!crashed && t.publisher.publishes.length === 1) {
        crashed = true;
        throw new Error("simulated crash after publish");
      }
      return innerRun(fn);
    };
    await expect(
      executeCommand(t.deps, ctx(ids, ids.actors.system), {
        type: "dispatch_publication",
        payload: { intentId },
      }),
    ).rejects.toThrow("simulated crash after publish");
    t.deps.uow.run = innerRun;
    expect(crashed).toBe(true);
    expect(t.publisher.publishes).toHaveLength(1);

    const recorded = await t.deps.uow.repos.events.list(scope, {
      objectType: "item",
      objectId: itemId,
    });
    expect(
      recorded.some(
        (event) =>
          event.eventType === "item.publish_attempted" &&
          (event.payload as { containerId?: unknown } | null)?.containerId === "container_1",
      ),
    ).toBe(true);

    // Retry: the recorded attempt turns into verifying — no second call.
    const retry = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.data).toMatchObject({ action: "verifying", step: "publish" });
    expect(t.publisher.creates).toHaveLength(1);
    expect(t.publisher.publishes).toHaveLength(1);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("verifying");
    const intent = await t.deps.uow.repos.intents.get(scope, intentId);
    expect(intent).toMatchObject({ status: "verifying", containerId: "container_1" });

    // The post is live: reconcile finds it and publishes the item.
    t.publisher.recentMedia = [
      {
        externalId: "ig_media_1",
        caption: "legenda 1",
        permalink: "https://instagram.test/p/1",
        takenAt: new Date("2026-10-05T14:00:00.000Z"),
      },
    ];
    const reconciled = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "reconcile_publication",
      payload: { itemId },
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.data).toMatchObject({ reconciled: true, externalId: "ig_media_1" });
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("published");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("published");
  });

  it("with the kill switch off nothing is sent and the intent stays held", async () => {
    const t = makeTestDeps({ publishEnabled: false });
    const ids = await openTestAccount(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const scope = scopeOf(ids);
    const { itemId, intentId } = await deliverDueApprovedItem(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ action: "held", reasons: ["publish_disabled"] });
    expect(t.publisher.creates).toHaveLength(0);
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("held");
    expect((await t.deps.uow.repos.intents.get(scope, intentId))?.status).toBe("held");
  });

  it("when the switch comes back on, dispatch releases the held intent for the next due run", async () => {
    const t = makeTestDeps({ publishEnabled: false });
    const ids = await openTestAccount(t);
    await approveLiveMandate(t, ids);
    await seedInstagramConnection(t, ids);
    const scope = scopeOf(ids);
    const future = new Date("2026-10-05T14:30:00.000Z");
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ scheduledFor: future }],
    });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await intentOf(t, ids, itemIds[0]!, versionHashes[0]!);
    const held = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: intent.id },
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.value.data).toMatchObject({ action: "held" });

    t.deps.isPublishEnabled = () => true;
    const released = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: intent.id },
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.value.data).toMatchObject({ action: "released" });
    expect(t.publisher.publishes).toHaveLength(0);
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("scheduled");
    expect((await t.deps.uow.repos.intents.get(scope, intent.id))?.status).toBe("pending");

    // Due now: the next dispatch sends.
    await t.deps.uow.repos.items.update(scope, itemIds[0]!, { scheduledFor: dueScheduledFor() });
    await t.deps.uow.repos.intents.update(scope, intent.id, { scheduledFor: dueScheduledFor() });
    const sent = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication",
      payload: { intentId: intent.id },
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.data).toMatchObject({ action: "published" });
    expect(t.publisher.publishes).toHaveLength(1);
  });
});
