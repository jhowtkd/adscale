import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { itemVersionHash } from "./item-shared";
import { ctx, deliverTestBatch, frontIdOf, seedWork, setup, uuid } from "./testing/items";

const SCHEDULED = new Date("2026-10-09T12:00:00.000Z");

describe("deliver_batch", () => {
  it("creates the batch with deadline, items and version 1", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { batchId, itemIds, versionHashes } = await deliverTestBatch(t, ids);

    const batch = await t.deps.uow.repos.batches.get(scope, batchId);
    expect(batch).toMatchObject({
      title: "Lote 1",
      status: "delivered",
      approveByAt: new Date("2026-10-07T17:00:00.000Z"),
    });
    expect(batch?.deliveredAt).not.toBeNull();

    const items = await t.deps.uow.repos.items.list(scope);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(itemIds).toContain(item.id);
      expect(item).toMatchObject({
        batchId,
        status: "awaiting_approval",
        destination: "instagram:@brand",
        scheduledFor: SCHEDULED,
        // Item limit: scheduled time − 2 h.
        deadlineAt: new Date("2026-10-09T10:00:00.000Z"),
      });
    }
    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      versionHash: versionHashes[0],
      caption: "legenda 1",
      destination: "instagram:@brand",
      authorRole: "agent",
    });

    const events = await t.deps.uow.repos.events.list(scope);
    const types = events.map((e) => e.eventType);
    expect(types).toContain("item.delivered");
    expect(types).toContain("batch.delivered");
    expect(types).toContain("notification.requested");
    const delivered = events.find((e) => e.eventType === "item.delivered");
    expect(delivered?.payload).toMatchObject({
      destinationAccount: "instagram:@brand",
      versionHash: versionHashes[0],
    });
  });

  it("hashes output + caption + destination account + scheduled time", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const seeded = seedWork(t, ids.workspaceId);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "deliver_batch",
      payload: {
        title: "Lote hash",
        frontId,
        approveByAt: new Date("2026-10-07T17:00:00.000Z"),
        items: [
          {
            creativeWorkId: seeded.workId,
            creativeWorkOutputId: seeded.outputId,
            caption: "olá",
            destinationAccount: "instagram:@brand",
            scheduledFor: SCHEDULED,
          },
        ],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const expected = itemVersionHash({
      output: seeded.outputId,
      caption: "olá",
      destination: "instagram:@brand",
      scheduledFor: SCHEDULED,
    });
    expect(outcome.value.data).toMatchObject({ versionHashes: [expected] });
    const items = await t.deps.uow.repos.items.list(scope);
    expect(items[0]?.currentVersionHash).toBe(expected);
  });

  it("rejects works and outputs outside the workspace", async () => {
    const { t, ids } = await setup();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const foreignWork = uuid();
    const foreignOutput = uuid();
    t.gateway.works.set(foreignWork, { id: foreignWork, workspaceId: uuid() });
    t.gateway.addOutput({ id: foreignOutput, workspaceId: uuid(), workId: foreignWork });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "deliver_batch",
      payload: {
        title: "Lote estranho",
        frontId,
        approveByAt: new Date("2026-10-07T17:00:00.000Z"),
        items: [
          {
            creativeWorkId: foreignWork,
            creativeWorkOutputId: foreignOutput,
            caption: "x",
            destinationAccount: "instagram:@brand",
            scheduledFor: SCHEDULED,
          },
        ],
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("unknown_creative_work");
    expect(await t.deps.uow.repos.batches.list({ workspaceId: ids.workspaceId, accountId: ids.accountId })).toHaveLength(0);
  });

  it("rejects an output that does not belong to the work", async () => {
    const { t, ids } = await setup();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const first = seedWork(t, ids.workspaceId);
    const second = seedWork(t, ids.workspaceId);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "deliver_batch",
      payload: {
        title: "Lote trocado",
        frontId,
        approveByAt: new Date("2026-10-07T17:00:00.000Z"),
        items: [
          {
            creativeWorkId: first.workId,
            creativeWorkOutputId: second.outputId,
            caption: "x",
            destinationAccount: "instagram:@brand",
            scheduledFor: SCHEDULED,
          },
        ],
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("output_work_mismatch");
  });

  it("rejects unknown fronts and keeps delivery agent/system-only", async () => {
    const { t, ids } = await setup();
    const seeded = seedWork(t, ids.workspaceId);
    const payload = {
      title: "Lote",
      frontId: uuid(),
      approveByAt: new Date("2026-10-07T17:00:00.000Z"),
      items: [
        {
          creativeWorkId: seeded.workId,
          creativeWorkOutputId: seeded.outputId,
          caption: "x",
          destinationAccount: "instagram:@brand",
          scheduledFor: SCHEDULED,
        },
      ],
    };
    const unknown = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "deliver_batch",
      payload,
    });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error.code).toBe("unknown_front");

    const goodFront = await frontIdOf(t, ids, "social_instagram");
    const forbidden = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "deliver_batch",
      payload: { ...payload, frontId: goodFront },
    });
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.error.code).toBe("forbidden_actor");

    const viaSystem = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "deliver_batch",
      payload: { ...payload, frontId: goodFront },
    });
    expect(viaSystem.ok).toBe(true);
  });

  it("marks delivered needs-confirmation items", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ caption: "50% off hoje", needsConfirmation: true }],
    });
    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! });
    expect(versions[0]?.reviewerFindings).toMatchObject({ needsConfirmation: true });
  });
});
