import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import type { EquipeFrontKey } from "../data";
import {
  approveAll,
  closeTestRound,
  ctx,
  frontIdOf,
  frontStatusOf,
  openTestRound,
  scoreAll,
  setNow,
  setupCalibration,
  submitCorrection,
  type CalibrationIds,
  type TestDeps,
} from "./testing/calibration";

type Play = (round: Awaited<ReturnType<typeof openTestRound>>) => Promise<void>;

async function runWeek(
  t: TestDeps,
  ids: CalibrationIds,
  weekStart: Date,
  play: Play,
  front: EquipeFrontKey = "social_instagram",
) {
  setNow(t, weekStart);
  const round = await openTestRound(t, ids, { front });
  await play(round);
  return closeTestRound(t, ids, round.roundId);
}

async function passRound(t: TestDeps, ids: CalibrationIds, itemIds: string[], roundId: string) {
  await scoreAll(t, ids, roundId, itemIds);
  await approveAll(t, ids, itemIds);
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
const WEEK_1 = new Date("2026-10-05T14:00:00.000Z");

describe("close_round", () => {
  it("passes with 4 approvals and advances the sequence", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await passRound(t, ids, round.itemIds, round.roundId);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_round",
      payload: { roundId: round.roundId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      outcome: "passed",
      consecutivePasses: 1,
      roundsCompleted: 1,
      scopeDecision: false,
    });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "front.round_recorded",
      "round.closed",
      "notification.requested",
    ]);
    expect(await frontStatusOf(t, ids, round.frontId)).toEqual({
      status: "calibrating",
      calibrationSequence: 1,
      roundsUsed: 1,
    });
  });

  it("passes at the 3-of-4 minimum and counts taste as a decision", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await approveAll(t, ids, round.itemIds.slice(0, 2));
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: round.itemIds[2]!, category: "visual" },
    });
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("passed");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const saved = await t.deps.uow.repos.calibrationRounds.get(scope, round.roundId);
    expect(saved?.decision).toMatchObject({ decisions: 3, requiredDecisions: 3 });
  });

  it("keeps the sequence on inconclusive rounds", async () => {
    const { t, ids } = await setupCalibration();
    const first = await runWeek(t, ids, WEEK_1, async (round) => {
      await passRound(t, ids, round.itemIds, round.roundId);
    });
    expect(first).toMatchObject({ outcome: "passed", consecutivePasses: 1 });
    const second = await runWeek(t, ids, new Date(WEEK_1.getTime() + WEEK), async (round) => {
      await scoreAll(t, ids, round.roundId, round.itemIds);
      await approveAll(t, ids, round.itemIds.slice(0, 2));
    });
    expect(second).toMatchObject({ outcome: "inconclusive", consecutivePasses: 1 });
    const third = await runWeek(t, ids, new Date(WEEK_1.getTime() + 2 * WEEK), async (round) => {
      await passRound(t, ids, round.itemIds, round.roundId);
    });
    expect(third).toMatchObject({ outcome: "passed", consecutivePasses: 2 });
  });

  it("failure beats inconclusive and resets the sequence", async () => {
    const { t, ids } = await setupCalibration();
    await runWeek(t, ids, WEEK_1, async (round) => {
      await passRound(t, ids, round.itemIds, round.roundId);
    });
    const failed = await runWeek(t, ids, new Date(WEEK_1.getTime() + WEEK), async (round) => {
      await scoreAll(t, ids, round.roundId, round.itemIds);
      await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
        type: "mark_critical_failure",
        payload: { roundId: round.roundId, itemId: round.itemIds[0]!, reason: "invented price" },
      });
    });
    expect(failed).toMatchObject({ outcome: "failed", consecutivePasses: 0, roundsCompleted: 2 });
  });

  it.each([
    ["score below 14", { facts: 3, brand: 3, usefulness: 3, execution: 3 }, "score_below_14"],
    ["dimension below 3", { facts: 4, brand: 4, usefulness: 2, execution: 4 }, "dimension_below_3"],
  ])("fails on %s", async (_label, rubric, cause) => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]!, ...rubric },
    });
    await scoreAll(t, ids, round.roundId, round.itemIds.slice(1));
    await approveAll(t, ids, round.itemIds);
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("failed");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const saved = await t.deps.uow.repos.calibrationRounds.get(scope, round.roundId);
    const decision = saved?.decision as {
      items: Array<{ itemId: string }>;
      failures: Array<{ itemIndex: number; causes: string[] }>;
    };
    const index = decision.items.findIndex((entry) => entry.itemId === round.itemIds[0]);
    expect(decision.failures).toEqual([{ itemIndex: index, causes: [cause] }]);
  });

  it("fails on a withdrawn item and on a fact rejection", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]!, note: "fix" },
    });
    await submitCorrection(t, ids, round.itemIds[0]!, "corrected");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]! },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: round.itemIds[1]!, category: "fact" },
    });
    await approveAll(t, ids, round.itemIds.slice(2));
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("failed");
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const saved = await t.deps.uow.repos.calibrationRounds.get(scope, round.roundId);
    const decision = saved?.decision as {
      items: Array<{ itemId: string }>;
      failures: Array<{ itemIndex: number; causes: string[] }>;
    };
    const at = (itemId: string) => decision.items.findIndex((entry) => entry.itemId === itemId);
    const expected = [
      { itemIndex: at(round.itemIds[0]!), causes: ["withdrawn"] },
      { itemIndex: at(round.itemIds[1]!), causes: ["fact_brand_rejection"] },
    ].sort((a, b) => a.itemIndex - b.itemIndex);
    expect(decision.failures).toEqual(expected);
  });

  it("applies the paid-media minimum of 2 of 3", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "midia_paga");
    const passed = await runWeek(
      t,
      ids,
      WEEK_1,
      async (round) => {
        await scoreAll(t, ids, round.roundId, round.itemIds);
        await approveAll(t, ids, round.itemIds.slice(0, 2));
      },
      "midia_paga",
    );
    expect(passed.outcome).toBe("passed");
    const thin = await runWeek(
      t,
      ids,
      new Date(WEEK_1.getTime() + WEEK),
      async (round) => {
        await scoreAll(t, ids, round.roundId, round.itemIds);
        await approveAll(t, ids, round.itemIds.slice(0, 1));
      },
      "midia_paga",
    );
    expect(thin.outcome).toBe("inconclusive");
    expect(await frontStatusOf(t, ids, frontId)).toMatchObject({
      calibrationSequence: 1,
      roundsUsed: 2,
    });
  });

  it("refuses to close with an unscored item, twice, and for agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds.slice(0, 3));
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_round",
      payload: { roundId: round.roundId },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("unscored_item");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "close_round",
      payload: { roundId: round.roundId },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
    await scoreAll(t, ids, round.roundId, round.itemIds.slice(3));
    const system = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "close_round",
      payload: { roundId: round.roundId },
    });
    expect(system.ok).toBe(true);
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_round",
      payload: { roundId: round.roundId },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("round_closed");
  });

  it("opens the scope decision after 6 rounds without 3 consecutive", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    for (let week = 0; week < 6; week += 1) {
      const closed = await runWeek(t, ids, new Date(WEEK_1.getTime() + week * WEEK), async (round) => {
        await scoreAll(t, ids, round.roundId, round.itemIds);
      });
      expect(closed.outcome).toBe("inconclusive");
    }
    expect(await frontStatusOf(t, ids, frontId)).toMatchObject({
      status: "scope_decision",
      roundsUsed: 6,
    });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const notices = (await t.deps.uow.repos.events.list(scope, { eventType: "notification.requested" }))
      .map((e) => (e.payload as { templateKey?: string }).templateKey)
      .filter((key) => key === "front.scope_decision_opened");
    expect(notices).toHaveLength(2);
  });

  it("opens the scope decision when 6 weeks elapse before 6 rounds", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    setNow(t, new Date(WEEK_1.getTime() + 6 * WEEK));
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await approveAll(t, ids, round.itemIds);
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed.outcome).toBe("passed");
    expect(await frontStatusOf(t, ids, round.frontId)).toMatchObject({ status: "scope_decision" });
  });

  it("does not open the scope decision once 3 consecutive passed", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    for (let week = 0; week < 6; week += 1) {
      await runWeek(t, ids, new Date(WEEK_1.getTime() + week * WEEK), async (round) => {
        await scoreAll(t, ids, round.roundId, round.itemIds);
        if (week < 3) await approveAll(t, ids, round.itemIds);
      });
    }
    expect(await frontStatusOf(t, ids, frontId)).toEqual({
      status: "calibrating",
      calibrationSequence: 3,
      roundsUsed: 6,
    });
  });

  it("refuses to close once the front is awaiting the scope decision", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    setNow(t, new Date(WEEK_1.getTime() + 6 * WEEK));
    const opened = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_scope_decision",
      payload: { frontId: round.frontId },
    });
    expect(opened.ok).toBe(true);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "close_round",
      payload: { roundId: round.roundId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
  });
});
