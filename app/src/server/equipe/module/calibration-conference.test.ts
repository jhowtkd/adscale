import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { getClientPipeline, getItemDetail } from "./queries";
import {
  ctx,
  frontIdOf,
  openTestRound,
  releaseAll,
  scoreAll,
  setupCalibration,
} from "./testing/calibration";
import { deliverTestBatch, uuid } from "./testing/items";

describe("calibration conference: client decisions", () => {
  it("refuses approve_item until quality releases the current version", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: round.versionHashes[0]! },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("conference_pending");
    await scoreAll(t, ids, round.roundId, [itemId]);
    const stillBlocked = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: round.versionHashes[0]! },
    });
    expect(stillBlocked.ok).toBe(false);
    await releaseAll(t, ids, round.roundId, [itemId]);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: round.versionHashes[0]! },
    });
    expect(approved.ok).toBe(true);
  });

  it("reports approve_batch per item as not_ready until release", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const pending = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_batch",
      payload: {
        items: round.itemIds.map((itemId, index) => ({
          itemId,
          versionHash: round.versionHashes[index]!,
        })),
      },
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    const results = pending.value.data.results as Array<{
      itemId: string;
      outcome: string;
      conferencePending?: true;
    }>;
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.outcome === "not_ready")).toBe(true);
    expect(results.every((r) => r.conferencePending === true)).toBe(true);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await releaseAll(t, ids, round.roundId, round.itemIds.slice(0, 2));
    const partial = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_batch",
      payload: {
        items: round.itemIds.map((itemId, index) => ({
          itemId,
          versionHash: round.versionHashes[index]!,
        })),
      },
    });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    const outcomes = (partial.value.data.results as Array<{ outcome: string }>).map((r) => r.outcome);
    expect(outcomes).toEqual(["approved", "approved", "not_ready", "not_ready"]);
  });

  it("refuses request_adjustment until release", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId, category: "visual" },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("conference_pending");
    await scoreAll(t, ids, round.roundId, [itemId]);
    await releaseAll(t, ids, round.roundId, [itemId]);
    const requested = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId, category: "visual" },
    });
    expect(requested.ok).toBe(true);
  });

  it("refuses choose_piece on an un-conferred paid-media angle", async () => {
    const { t, ids } = await setupCalibration();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const round = await openTestRound(t, ids, { front: "midia_paga" });
    const itemId = round.itemIds[0]!;
    const item = await t.deps.uow.repos.items.get(scope, itemId);
    const chosen = uuid();
    t.gateway.addOutput({ id: chosen, workspaceId: ids.workspaceId, workId: item!.creativeWorkId! });
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: { itemId, expectedVersionHash: round.versionHashes[0]!, creativeWorkOutputId: chosen },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("conference_pending");
    await scoreAll(t, ids, round.roundId, [itemId]);
    await releaseAll(t, ids, round.roundId, [itemId]);
    const decided = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "choose_piece",
      payload: { itemId, expectedVersionHash: round.versionHashes[0]!, creativeWorkOutputId: chosen },
    });
    expect(decided.ok).toBe(true);
  });

  it("refuses confirm_business_fact until release", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{ caption: "retirada na loja", needsConfirmation: true }, {}, {}, {}],
    });
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roundId = (opened.value.data as { roundId: string }).roundId;
    const itemId = delivered.itemIds[0]!;
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_business_fact",
      payload: { itemId, expectedVersionHash: delivered.versionHashes[0]! },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("conference_pending");
    await scoreAll(t, ids, roundId, delivered.itemIds);
    await releaseAll(t, ids, roundId, delivered.itemIds);
    const confirmed = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "confirm_business_fact",
      payload: { itemId, expectedVersionHash: delivered.versionHashes[0]! },
    });
    expect(confirmed.ok).toBe(true);
  });

  it("re-arms the gate on a caption edit until quality re-checks the new version", async () => {
    const { t, ids } = await setupCalibration();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId, caption: "too soon" },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("conference_pending");
    await scoreAll(t, ids, round.roundId, [itemId]);
    await releaseAll(t, ids, round.roundId, [itemId]);
    const edited = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId, caption: "client rewrite" },
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const editedHash = edited.value.data.versionHash as string;
    expect(editedHash).not.toBe(round.versionHashes[0]);
    // The new version needs the quality re-check again: still conferring.
    const current = await t.deps.uow.repos.items.get(scope, itemId);
    expect(current?.currentVersionHash).toBe(editedHash);
    const blocked = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: editedHash },
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("conference_pending");
    // Triage passing alone does not confer; quality releases the new version.
    await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "record_caption_triage",
      payload: { itemId, natures: ["none"], qualityRecheckPassed: true },
    });
    const stillBlocked = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: editedHash },
    });
    expect(stillBlocked.ok).toBe(false);
    const rechecked = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(rechecked.ok).toBe(true);
    if (!rechecked.ok) return;
    expect(rechecked.value.data).toMatchObject({ versionHash: editedHash, corrected: true });
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: editedHash },
    });
    expect(approved.ok).toBe(true);
  });
});

describe("calibration conference: client reads omit un-conferred items", () => {
  it("hides round items from the pipeline and detail until release", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const hidden = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(hidden?.items).toHaveLength(0);
    expect(hidden?.columns.map((c) => c.itemIds)).toEqual([[], [], [], [], []]);
    for (const itemId of round.itemIds) {
      expect(await getItemDetail(t.deps.uow.repos, ids.workspaceId, ids.accountId, itemId)).toBeNull();
    }
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await releaseAll(t, ids, round.roundId, round.itemIds);
    const shown = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(shown?.items).toHaveLength(4);
    expect(shown?.columns.find((c) => c.key === "needs_you")?.itemIds).toHaveLength(4);
    const detail = await getItemDetail(
      t.deps.uow.repos,
      ids.workspaceId,
      ids.accountId,
      round.itemIds[0]!,
    );
    expect(detail?.versions).toHaveLength(1);
  });

  it("gates delivered items before their round opens", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const hidden = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(hidden?.items).toHaveLength(0);
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: delivered.itemIds[0]!, expectedVersionHash: delivered.versionHashes[0]! },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("conference_pending");
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const roundId = (opened.value.data as { roundId: string }).roundId;
    await scoreAll(t, ids, roundId, delivered.itemIds);
    await releaseAll(t, ids, roundId, delivered.itemIds);
    const shown = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(shown?.items).toHaveLength(4);
  });

  it("keeps conferring past the limit and frees released fronts", async () => {
    const { t, ids } = await setupCalibration();
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const delivered = await deliverTestBatch(t, ids, { items: [{}] });
    await t.deps.uow.repos.fronts.update(scope, frontId, { status: "scope_decision" });
    const hidden = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(hidden?.items).toHaveLength(0);
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: delivered.itemIds[0]!, expectedVersionHash: delivered.versionHashes[0]! },
    });
    expect(early.ok).toBe(false);
    await t.deps.uow.repos.fronts.update(scope, frontId, { status: "released" });
    const shown = await getClientPipeline(t.deps.uow.repos, ids.workspaceId, ids.accountId);
    expect(shown?.items).toHaveLength(1);
    const approved = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId: delivered.itemIds[0]!, expectedVersionHash: delivered.versionHashes[0]! },
    });
    expect(approved.ok).toBe(true);
  });
});
