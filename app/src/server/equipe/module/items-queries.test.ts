import { seedInstagramConnection } from "./testing/publication";
import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getClientPipeline, getItemDetail } from "./queries";
import { ctx, deliverTestBatch, setup } from "./testing/items";

describe("client pipeline", () => {
  it("groups items in columns with the single state per item", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{}, {}, { needsConfirmation: true }],
    });
    // Ready → scheduled; edited → in review; third stays "pede confirmação".
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[1]!, caption: "editada" },
    });

    const pipeline = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(pipeline).not.toBeNull();
    const columns = Object.fromEntries(pipeline!.columns.map((c) => [c.key, c.itemIds]));
    expect(columns).toMatchObject({
      needs_you: [itemIds[2]],
      in_progress: [itemIds[1]],
      scheduled: [itemIds[0]],
      finished: [],
      missed: [],
    });
    const states = Object.fromEntries(pipeline!.items.map((i) => [i.item.id, i.displayState]));
    expect(states).toMatchObject({
      [itemIds[0]!]: "scheduled",
      [itemIds[1]!]: "edited_in_review",
      [itemIds[2]!]: "needs_confirmation",
    });
    expect(pipeline!.items[0]?.batch?.id).toBeDefined();
  });

  it("returns null for unknown accounts", async () => {
    const { t, ids } = await setup();
    expect(
      await getClientPipeline(t.deps.uow.repos, ids.workspaceId, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("carries each item's current title and thumbnail source, no detail fetch per card", async () => {
    const { t, ids } = await setup();
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, {
      items: [{ caption: "First caption" }],
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "Edited caption" },
    });

    const pipeline = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    const found = pipeline!.items.find((i) => i.item.id === itemIds[0]!);
    const current = await t.deps.uow.repos.itemVersions.getByHash(
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      itemIds[0]!,
      found!.item.currentVersionHash!,
    );
    expect(found?.preview).not.toBeNull();
    // The preview follows the current version, not the delivered one.
    expect(found?.preview?.caption).toBe("Edited caption");
    expect(found?.preview?.creativeWorkOutputId).toBe(current?.creativeWorkOutputId);
    expect(found?.preview?.versionHash).not.toBe(versionHashes[0]);
    expect(found?.preview?.versionHash).toBe(found?.item.currentVersionHash);
  });
});

describe("item detail", () => {
  it("shows versions, receipts, findings, triage, destination and intent", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{}] });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId: itemIds[0]!, caption: "abrimos às 9h" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId: itemIds[0]!, natures: ["permanent_fact"] },
    });
    const item = await t.deps.uow.repos.items.get(
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      itemIds[0]!,
    );
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: item!.currentVersionHash! },
    });

    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail).not.toBeNull();
    expect(detail?.versions.map((v) => v.caption)).toEqual(["legenda 1", "abrimos às 9h"]);
    expect(detail?.receipts.map((r) => r.action)).toEqual(["approve_item"]);
    expect(detail?.review.status).toBe("needs_confirmation");
    expect(detail?.destinationAccount).toBe("instagram:@brand");
    expect(detail?.triage).toHaveLength(1);
    expect(detail?.triage[0]?.payload).toMatchObject({ path: "confirm_as_business_fact" });
    expect(detail?.activeIntent).toMatchObject({ status: "pending" });
    expect(detail?.batch?.title).toBe("Lote 1");
  });

  it("blocks an item with an open escalation row linked to it", async () => {
    const { t, ids } = await setup();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const { itemIds } = await deliverTestBatch(t, ids, { items: [{}] });
    const escalation = await t.deps.uow.repos.escalations.create(scope, {
      kind: "content",
      severity: "high",
      ownerRole: "quality",
      itemId: itemIds[0]!,
    });
    const blocked = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(blocked?.review.status).toBe("blocked");
    expect(blocked?.review.flags.blocked).toBe(true);
    const pipeline = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(pipeline?.items.find((i) => i.item.id === itemIds[0])?.displayState).toBe("blocked");

    await t.deps.uow.repos.escalations.update(scope, escalation.id, { status: "resolved" });
    const cleared = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(cleared?.review.status).toBe("ready");
  });

  it("hides voided intents and returns null for unknown items", async () => {
    const { t, ids } = await setup();
    await seedInstagramConnection(t, ids);
    const { itemIds, versionHashes } = await deliverTestBatch(t, ids, { items: [{}] });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "cancel_scheduled",
      payload: { itemId: itemIds[0]! },
    });
    const detail = await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemIds[0]!);
    expect(detail?.activeIntent).toBeNull();
    expect(
      await getItemDetail(
        t.deps.uow.repos,
        ids.workspaceId,
        ids.accountId,
        "00000000-0000-0000-0000-000000000000",
      ),
    ).toBeNull();
  });
});
