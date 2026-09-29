import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { ctx, deliverTestBatch, seedWork, setup, uuid } from "./testing/items";

describe("choose_piece", () => {
  it("chooses a Peça as a human Approval with receipt, no intent", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      front: "midia_paga",
      items: [{ caption: "ângulo 1" }],
    });
    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    const chosen = uuid();
    t.gateway.addOutput({ id: chosen, workspaceId: ids.workspaceId, workId: item!.creativeWorkId! });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: {
        itemId: itemIds[0]!,
        expectedVersionHash: versionHashes[0]!,
        creativeWorkOutputId: chosen,
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "piece.chosen",
      "notification.requested",
    ]);
    const versionHash = outcome.value.data.versionHash as string;
    expect(versionHash).not.toBe(versionHashes[0]);

    const updated = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    expect(updated).toMatchObject({ status: "available_for_download", currentVersionHash: versionHash });
    const versions = await t.deps.uow.repos.itemVersions.list(scope, { itemId: itemIds[0]! });
    expect(versions).toHaveLength(2);
    expect(versions.find((v) => v.versionHash === versionHash)).toMatchObject({
      creativeWorkOutputId: chosen,
      authorRole: "client_person",
    });
    const receipts = await t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      personKind: "client_person",
      personRole: "approver",
      action: "choose_piece",
      objectVersion: versionHash,
    });
    expect(receipts[0]?.detail).toMatchObject({ creativeWorkOutputId: chosen });
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);

    const retry = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: {
        itemId: itemIds[0]!,
        expectedVersionHash: versionHashes[0]!,
        creativeWorkOutputId: chosen,
      },
    });
    expect(retry).toMatchObject({ ok: true, value: { data: { alreadyChosen: true, versionHash }, events: [] } });
    const differentChoice = uuid();
    t.gateway.addOutput({ id: differentChoice, workspaceId: ids.workspaceId, workId: item!.creativeWorkId! });
    const rejected = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: {
        itemId: itemIds[0]!,
        expectedVersionHash: versionHashes[0]!,
        creativeWorkOutputId: differentChoice,
      },
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: "version_mismatch" } });
  });

  it("enforces the exact item deadline for choose_piece", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      front: "midia_paga",
      items: [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }],
    });
    const item = await t.deps.uow.repos.items.get(scope, itemIds[0]!);
    const chosen = uuid();
    t.gateway.addOutput({ id: chosen, workspaceId: ids.workspaceId, workId: item!.creativeWorkId! });
    t.deps.clock = { now: () => new Date("2026-10-09T10:00:00.000Z") };
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]!, creativeWorkOutputId: chosen },
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "item_limit_passed" } });
    expect((await t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(await t.deps.uow.repos.receipts.list(scope)).toHaveLength(0);
    expect(await t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("agent cannot choose a piece — Selection stays distinct from Approval", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      front: "midia_paga",
      items: [{}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "choose_piece",
      payload: {
        itemId: itemIds[0]!,
        expectedVersionHash: versionHashes[0]!,
        creativeWorkOutputId: uuid(),
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("forbidden_actor");
  });

  it("refuses social items, stale versions and foreign outputs", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const social = await deliverTestBatch(t, ids, { items: [{}] });
    const media = await deliverTestBatch(t, ids, { front: "midia_paga", items: [{}] });
    const mediaItem = await t.deps.uow.repos.items.get(scope, media.itemIds[0]!);
    const chosen = uuid();
    t.gateway.addOutput({ id: chosen, workspaceId: ids.workspaceId, workId: mediaItem!.creativeWorkId! });

    const wrongFront = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: {
        itemId: social.itemIds[0]!,
        expectedVersionHash: social.versionHashes[0]!,
        creativeWorkOutputId: chosen,
      },
    });
    expect(wrongFront.ok).toBe(false);
    if (!wrongFront.ok) expect(wrongFront.error.code).toBe("wrong_front");

    const stale = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: {
        itemId: media.itemIds[0]!,
        expectedVersionHash: "velho",
        creativeWorkOutputId: chosen,
      },
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("version_mismatch");

    const foreign = seedWork(t, uuid());
    const foreignOutput = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: {
        itemId: media.itemIds[0]!,
        expectedVersionHash: media.versionHashes[0]!,
        creativeWorkOutputId: foreign.outputId,
      },
    });
    expect(foreignOutput.ok).toBe(false);
    if (!foreignOutput.ok) expect(foreignOutput.error.code).toBe("unknown_creative_output");
  });
});
