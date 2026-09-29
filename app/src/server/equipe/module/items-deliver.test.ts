import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { itemVersionHash } from "./item-shared";
import { approveTestItem, encryptedInstagramToken } from "./testing/publication";
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
      destinationIgUserId: null,
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

  it.each(["instagram:@bRAND", "instagram:ig-brand-17"])("pins %s to the server's canonical handle in version, hash and intent", async (destinationAccount) => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await seedConnection(t, ids, { igUserId: "ig-brand-17", igUsername: "Brand" });
    const seeded = seedWork(t, ids.workspaceId);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "deliver_batch",
      payload: {
        title: "Lote Instagram conectado",
        frontId,
        approveByAt: new Date("2026-10-07T17:00:00.000Z"),
        items: [{
          creativeWorkId: seeded.workId,
          creativeWorkOutputId: seeded.outputId,
          caption: "olá",
          destinationAccount,
          scheduledFor: SCHEDULED,
        }],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const expectedHash = itemVersionHash({
      output: seeded.outputId,
      caption: "olá",
      destination: "instagram:@Brand",
      destinationIgUserId: "ig-brand-17",
      scheduledFor: SCHEDULED,
    });
    const itemId = (outcome.value.data as { itemIds: string[] }).itemIds[0]!;
    const item = await t.deps.uow.repos.items.get(scope, itemId);
    const version = (await t.deps.uow.repos.itemVersions.list(scope, { itemId }))[0];
    await approveTestItem(t, ids, itemId, expectedHash);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemId, expectedHash);
    expect(item).toMatchObject({ destination: "instagram:@Brand", currentVersionHash: expectedHash });
    expect(version).toMatchObject({
      destination: "instagram:@Brand", destinationIgUserId: "ig-brand-17", versionHash: expectedHash,
    });
    expect(intent).toMatchObject({ destinationIgUserId: "ig-brand-17", versionHash: expectedHash });
  });

  it("canonicalizes an ID destination when an active connection has no username", async () => {
    const { t, ids } = await setup();
    await seedConnection(t, ids, { igUserId: "ig-no-handle", igUsername: null });
    const { itemIds } = await deliverTestBatch(t, ids, {
      items: [{ destinationAccount: "instagram:ig-no-handle" }],
    });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const version = (await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! }))[0];
    expect(version).toMatchObject({ destination: "instagram:ig-no-handle", destinationIgUserId: "ig-no-handle" });
  });

  it.each(["missing", "inactive"] as const)("preserves Instagram destination without pin when connection is %s", async (connectionState) => {
    const { t, ids } = await setup();
    if (connectionState === "inactive") {
      await seedConnection(t, ids, { igUserId: "ig-other", igUsername: "elsewhere", status: "revoked" });
    }
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ destinationAccount: "instagram:@external-handle", scheduledFor: new Date("2026-10-05T13:55:00.000Z") }],
    });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const version = (await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! }))[0];
    expect(version).toMatchObject({ destination: "instagram:@external-handle", destinationIgUserId: null });
    await approveTestItem(t, ids, itemIds[0]!, versionHashes[0]!);
    const intent = await t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!);
    const dispatch = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "dispatch_publication", payload: { intentId: intent!.id },
    });
    expect(dispatch).toMatchObject({ ok: true, value: { data: { action: "held", reasons: ["instagram_destination_changed"] } } });
    expect(t.publisher.creates).toHaveLength(0);
    expect(t.publisher.publishes).toHaveLength(0);
  });

  it.each(["instagram:@outro", "facebook:@brand"])("rejects mismatched second destination %s without persisting batch data", async (destinationAccount) => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await seedConnection(t, ids, { igUserId: "ig-brand", igUsername: "brand" });
    const first = seedWork(t, ids.workspaceId);
    const second = seedWork(t, ids.workspaceId);
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "deliver_batch",
      payload: {
        title: "Lote com destino divergente",
        frontId,
        approveByAt: new Date("2026-10-07T17:00:00.000Z"),
        items: [
          { creativeWorkId: first.workId, creativeWorkOutputId: first.outputId, caption: "válido", destinationAccount: "instagram:@BRAND", scheduledFor: SCHEDULED },
          { creativeWorkId: second.workId, creativeWorkOutputId: second.outputId, caption: "divergente", destinationAccount, scheduledFor: SCHEDULED },
        ],
      },
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "destination_mismatch" } });
    expect(await t.deps.uow.repos.batches.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.items.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.itemVersions.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
    expect(t.publisher.creates).toHaveLength(0);
    expect(t.publisher.publishes).toHaveLength(0);
    const events = await t.deps.uow.repos.events.list(scope);
    expect(events.some((event) => event.eventType === "batch.delivered" || event.eventType === "item.delivered")).toBe(false);
  });

  it("refuses an active but unreadable Instagram token", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    await seedConnection(t, ids, { encryptedToken: "not-a-valid-encrypted-token" });
    const outcome = await deliverOutcome(t, ids, "instagram:@brand");
    expect(outcome).toMatchObject({ ok: false, error: { code: "invalid_token" } });
    expect(await t.deps.uow.repos.batches.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.items.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.itemVersions.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
    expect(t.publisher.creates).toHaveLength(0);
    expect(t.publisher.publishes).toHaveLength(0);
    const events = await t.deps.uow.repos.events.list(scope);
    expect(events.some((event) => event.eventType === "batch.delivered" || event.eventType === "item.delivered")).toBe(false);
  });
});

async function seedConnection(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: Awaited<ReturnType<typeof setup>>["ids"],
  options: { igUserId?: string; igUsername?: string | null; status?: "active" | "revoked"; encryptedToken?: string },
) {
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  const custodian = (await t.deps.uow.repos.people.list(scope)).find((person) => person.role === "custodian");
  return t.deps.uow.repos.connections.create(scope, {
    provider: "instagram",
    encryptedToken: options.encryptedToken ?? encryptedInstagramToken(
      options.igUserId ?? "ig_brand", options.igUsername === undefined ? "brand" : options.igUsername,
    ),
    custodianPersonId: custodian?.id ?? null,
    status: options.status ?? "active",
  });
}

async function deliverOutcome(
  t: Awaited<ReturnType<typeof setup>>["t"],
  ids: Awaited<ReturnType<typeof setup>>["ids"],
  destinationAccount: string,
) {
  const seeded = seedWork(t, ids.workspaceId);
  const frontId = await frontIdOf(t, ids, "social_instagram");
  return executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "deliver_batch",
    payload: {
      title: "Lote",
      frontId,
      approveByAt: new Date("2026-10-07T17:00:00.000Z"),
      items: [{
        creativeWorkId: seeded.workId,
        creativeWorkOutputId: seeded.outputId,
        caption: "legenda",
        destinationAccount,
        scheduledFor: SCHEDULED,
      }],
    },
  });
}
