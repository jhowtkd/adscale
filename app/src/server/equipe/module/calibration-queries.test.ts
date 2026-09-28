import { describe, expect, it } from "vitest";
import { getQualityPipeline, getRoundDetail } from "./calibration-queries";
import { seedStaff } from "./testing/deps";
import {
  approveAll,
  closeTestRound,
  ctx,
  makeTestDeps,
  openTestRound,
  releaseAll,
  scoreAll,
  setupCalibration,
  submitCorrection,
} from "./testing/calibration";
import { openTestAccount } from "./testing/items";
import { executeCommand } from "./commands";

describe("getQualityPipeline", () => {
  it("groups rounds by state across accounts", async () => {
    const t = makeTestDeps();
    const first = await openTestAccount(t, { fronts: ["social_instagram"] });
    const second = await openTestAccount(t, { fronts: ["social_instagram"] });
    for (const ids of [first, second]) {
      await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, {
        status: "calibrating",
      });
    }
    const open = await openTestRound(t, first);
    const closing = await openTestRound(t, second);
    await scoreAll(t, second, closing.roundId, closing.itemIds);
    await releaseAll(t, second, closing.roundId, closing.itemIds);
    await approveAll(t, second, closing.itemIds);
    await closeTestRound(t, second, closing.roundId);
    const qualityId = (first.actors.quality as { staffId: string }).staffId;
    const pipeline = await getQualityPipeline(t.deps.uow.internal, qualityId);
    expect(pipeline.ok).toBe(true);
    if (!pipeline.ok) return;
    expect(pipeline.value.open.map((entry) => entry.roundId)).toEqual([open.roundId]);
    expect(pipeline.value.open[0]).toMatchObject({
      accountId: first.accountId,
      status: "open",
      weekKey: "2026-W41",
    });
    expect(pipeline.value.recentlyClosed.map((entry) => entry.roundId)).toEqual([closing.roundId]);
    expect(pipeline.value.recentlyClosed[0]).toMatchObject({
      accountId: second.accountId,
      status: "closed",
      outcome: "passed",
    });
  });

  it("refuses staff who are not active quality", async () => {
    const { t, ids } = await setupCalibration();
    await openTestRound(t, ids);
    const supportId = (ids.actors.support as { staffId: string }).staffId;
    expect((await getQualityPipeline(t.deps.uow.internal, supportId)).ok).toBe(false);
    expect((await getQualityPipeline(t.deps.uow.internal, "no-such-staff")).ok).toBe(false);
    const inactive = await seedStaff(t, "quality", { active: false });
    const gone = await getQualityPipeline(
      t.deps.uow.internal,
      (inactive as { staffId: string }).staffId,
    );
    expect(gone.ok).toBe(false);
    if (gone.ok) return;
    expect(gone.error.code).toBe("forbidden_actor");
  });
});

describe("getRoundDetail", () => {
  it("shows attempts, scores, quality state, verdicts and the summary", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await releaseAll(t, ids, round.roundId, round.itemIds);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: round.itemIds[1]!, category: "voice" },
    });
    await approveAll(t, ids, [round.itemIds[0]!, round.itemIds[2]!, round.itemIds[3]!]);
    const detail = await getRoundDetail(
      t.deps.uow.repos,
      ids.workspaceId,
      ids.accountId,
      round.roundId,
    );
    expect(detail?.round.id).toBe(round.roundId);
    expect(detail?.front?.id).toBe(round.frontId);
    expect(detail?.batch?.id).toBe(round.batchId);
    expect(detail?.summary).toBeNull();
    expect(detail?.items).toHaveLength(4);
    const byId = new Map(detail?.items.map((entry) => [entry.item.id, entry]));
    const first = byId.get(round.itemIds[0]!)!;
    expect(first.evaluatedAttempt?.versionHash).toBe(round.versionHashes[0]);
    expect(first.score?.verdict).toBe("pass");
    expect(first.quality.released).not.toBeNull();
    expect(first.client.verdict).toBe("approved");
    expect(byId.get(round.itemIds[1]!)?.client).toMatchObject({
      verdict: "taste_adjustment",
      clientCategory: "voice",
    });
    await closeTestRound(t, ids, round.roundId);
    const closed = await getRoundDetail(
      t.deps.uow.repos,
      ids.workspaceId,
      ids.accountId,
      round.roundId,
    );
    expect(closed?.summary).toMatchObject({ outcome: "passed" });
  });

  it("keeps withdrawn items in the round with their flag", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]!, note: "fix" },
    });
    await submitCorrection(t, ids, round.roundId, round.itemIds[0]!, "corrected");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]! },
    });
    const detail = await getRoundDetail(
      t.deps.uow.repos,
      ids.workspaceId,
      ids.accountId,
      round.roundId,
    );
    expect(detail?.items).toHaveLength(4);
    const withdrawn = detail?.items.find((entry) => entry.item.id === round.itemIds[0]);
    expect(withdrawn?.quality.withdrawn).not.toBeNull();
    expect(withdrawn?.item.batchId).toBeNull();
  });

  it("returns null for an unknown round", async () => {
    const { t, ids } = await setupCalibration();
    expect(
      await getRoundDetail(
        t.deps.uow.repos,
        ids.workspaceId,
        ids.accountId,
        "00000000-0000-4000-8000-000000000000",
      ),
    ).toBeNull();
  });
});
