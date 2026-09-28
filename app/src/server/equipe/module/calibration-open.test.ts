import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  approveAll,
  closeTestRound,
  ctx,
  frontIdOf,
  openTestRound,
  scoreAll,
  setNow,
  setup,
  setupCalibration,
  uuid,
} from "./testing/calibration";
import { deliverTestBatch } from "./testing/items";

describe("open_round", () => {
  it("opens a social round of 4 posts and moves the front into calibration", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ sequence: 1, weekKey: "2026-W41" });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "round.opened",
      "notification.requested",
    ]);
    const front = await t.deps.uow.repos.fronts.get(scope, frontId);
    expect(front?.status).toBe("calibrating");
    expect(front?.calibrationStartedAt).toEqual(new Date("2026-10-05T14:00:00.000Z"));
  });

  it("opens a paid-media round of 3 angles", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids, { front: "midia_paga" });
    expect(round.sequence).toBe(1);
    expect(round.itemIds).toHaveLength(3);
  });

  it("refuses a batch that is not exactly the round size", async () => {
    const { t, ids } = await setupCalibration();
    const socialId = await frontIdOf(t, ids, "social_instagram");
    const paidId = await frontIdOf(t, ids, "midia_paga");
    const short = await deliverTestBatch(t, ids, { front: "social_instagram", items: [{}, {}, {}] });
    const long = await deliverTestBatch(t, ids, {
      front: "midia_paga",
      items: [{}, {}, {}, {}],
    });
    for (const [frontId, batchId] of [
      [socialId, short.batchId],
      [paidId, long.batchId],
    ]) {
      const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
        type: "open_round",
        payload: { frontId: frontId!, batchId: batchId! },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("round_size_mismatch");
    }
  });

  it("refuses a second round in the same São Paulo week", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await closeTestRound(t, ids, round.roundId);
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: round.frontId, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("round_already_open_this_week");
  });

  it("refuses a new round while one is still open", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: round.frontId, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("round_already_open");
  });

  it("opens the next round the following week with the next sequence", async () => {
    const { t, ids } = await setupCalibration();
    const first = await openTestRound(t, ids);
    await scoreAll(t, ids, first.roundId, first.itemIds);
    await approveAll(t, ids, first.itemIds);
    await closeTestRound(t, ids, first.roundId);
    setNow(t, new Date("2026-10-12T14:00:00.000Z"));
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: first.frontId, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ sequence: 2, weekKey: "2026-W42" });
  });

  it("keys the week on the São Paulo wall clock across the Sunday boundary", async () => {
    const { t, ids } = await setupCalibration();
    // Sunday 2026-10-04 23:30 in São Paulo (Monday 02:30 UTC).
    setNow(t, new Date("2026-10-05T02:30:00.000Z"));
    const first = await openTestRound(t, ids);
    expect(first.weekKey).toBe("2026-W40");
    await scoreAll(t, ids, first.roundId, first.itemIds);
    await closeTestRound(t, ids, first.roundId);
    // Monday 2026-10-05 00:30 in São Paulo (03:30 UTC): a new week.
    setNow(t, new Date("2026-10-05T03:30:00.000Z"));
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: first.frontId, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ weekKey: "2026-W41" });
  });

  it("refuses foreign batches, unknown batches and unknown fronts", async () => {
    const { t, ids } = await setupCalibration();
    const socialId = await frontIdOf(t, ids, "social_instagram");
    const paidId = await frontIdOf(t, ids, "midia_paga");
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const mismatch = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: paidId, batchId: delivered.batchId },
    });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.error.code).toBe("batch_front_mismatch");
    const unknownBatch = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: socialId, batchId: uuid() },
    });
    expect(unknownBatch.ok).toBe(false);
    if (unknownBatch.ok) return;
    expect(unknownBatch.error.code).toBe("unknown_batch");
    const unknownFront = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: uuid(), batchId: delivered.batchId },
    });
    expect(unknownFront.ok).toBe(false);
    if (unknownFront.ok) return;
    expect(unknownFront.error.code).toBe("unknown_front");
  });

  it("refuses to open while the account is still deploying", async () => {
    const { t, ids } = await setup();
    const fronts = await t.deps.uow.repos.fronts.list({
      workspaceId: ids.workspaceId,
      accountId: ids.accountId,
    });
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId: fronts[0]!.id, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
  });

  it("refuses to open on a front that is not calibrating", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    await t.deps.uow.repos.fronts.update(
      { workspaceId: ids.workspaceId, accountId: ids.accountId },
      frontId,
      { status: "released" },
    );
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
  });

  it("lets the system open; clients and quality staff may not", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    const delivered = await deliverTestBatch(t, ids, {
      front: "social_instagram",
      items: [{}, {}, {}, {}],
    });
    const system = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_round",
      payload: { frontId, batchId: delivered.batchId },
    });
    expect(system.ok).toBe(true);
    for (const actor of [ids.actors.approver, ids.actors.member, ids.actors.quality]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "open_round",
        payload: { frontId, batchId: delivered.batchId },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
  });
});
