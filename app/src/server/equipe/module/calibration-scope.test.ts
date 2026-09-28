import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  closeTestRound,
  ctx,
  frontIdOf,
  frontStatusOf,
  openTestRound,
  scoreAll,
  setNow,
  setupCalibration,
  type CalibrationIds,
  type TestDeps,
} from "./testing/calibration";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const WEEK_1 = new Date("2026-10-05T14:00:00.000Z");

/** Drive a front to the scope decision with 6 undecided rounds. */
async function driveToScopeDecision(t: TestDeps, ids: CalibrationIds): Promise<string> {
  for (let week = 0; week < 6; week += 1) {
    setNow(t, new Date(WEEK_1.getTime() + week * WEEK));
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await closeTestRound(t, ids, round.roundId);
  }
  return frontIdOf(t, ids, "social_instagram");
}

describe("resolve_scope_decision", () => {
  it("reduces the scope and restarts the sequence and the clock", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await driveToScopeDecision(t, ids);
    expect(await frontStatusOf(t, ids, frontId)).toMatchObject({ status: "scope_decision" });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_scope_decision",
      payload: { frontId, decision: "reduce_scope", note: "fewer formats" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toEqual({ frontId, decision: "reduce_scope" });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "front.scope_reduced",
      "notification.requested",
    ]);
    expect(await frontStatusOf(t, ids, frontId)).toEqual({
      status: "calibrating",
      calibrationSequence: 0,
      roundsUsed: 0,
    });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect((await t.deps.uow.repos.fronts.get(scope, frontId))?.calibrationStartedAt).toEqual(
      new Date(WEEK_1.getTime() + 5 * WEEK),
    );
    setNow(t, new Date(WEEK_1.getTime() + 6 * WEEK));
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed).toMatchObject({ roundsCompleted: 1 });
  });

  it("pauses or closes the front", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await driveToScopeDecision(t, ids);
    const paused = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_scope_decision",
      payload: { frontId, decision: "pause_front", note: "monthly fee adjusted" },
    });
    expect(paused.ok).toBe(true);
    expect(await frontStatusOf(t, ids, frontId)).toMatchObject({ status: "paused" });
    const { t: t2, ids: ids2 } = await setupCalibration();
    const frontId2 = await driveToScopeDecision(t2, ids2);
    const closed = await executeCommand(t2.deps, ctx(ids2, ids2.actors.quality), {
      type: "resolve_scope_decision",
      payload: { frontId: frontId2, decision: "close_front" },
    });
    expect(closed.ok).toBe(true);
    expect(await frontStatusOf(t2, ids2, frontId2)).toMatchObject({ status: "closed" });
  });

  it("refuses fronts that are not awaiting a decision, and refuses agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "resolve_scope_decision",
      payload: { frontId: round.frontId, decision: "reduce_scope" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "resolve_scope_decision",
      payload: { frontId: round.frontId, decision: "close_front" },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
  });
});

describe("open_scope_decision", () => {
  it("fires only after 6 weeks without 3 consecutive passes", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_scope_decision",
      payload: { frontId: round.frontId },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("limit_not_reached");
    setNow(t, new Date(WEEK_1.getTime() + 6 * WEEK));
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_scope_decision",
      payload: { frontId: round.frontId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "front.scope_decision_opened",
      "notification.requested",
      "notification.requested",
    ]);
    expect(await frontStatusOf(t, ids, round.frontId)).toMatchObject({ status: "scope_decision" });
  });

  it("never fires for a front that never started calibrating", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await frontIdOf(t, ids, "social_instagram");
    setNow(t, new Date(WEEK_1.getTime() + 12 * WEEK));
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_scope_decision",
      payload: { frontId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("limit_not_reached");
  });

  it("is a system-only trigger", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    setNow(t, new Date(WEEK_1.getTime() + 6 * WEEK));
    for (const actor of [ids.actors.quality, ids.actors.agent, ids.actors.approver]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "open_scope_decision",
        payload: { frontId: round.frontId },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
  });

  it("items keep conferring while the front awaits the scope decision", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    setNow(t, new Date(WEEK_1.getTime() + 6 * WEEK));
    await executeCommand(t.deps, ctx(ids, ids.actors.system), {
      type: "open_scope_decision",
      payload: { frontId: round.frontId },
    });
    const scored = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]!, facts: 4, brand: 4, usefulness: 3, execution: 4 },
    });
    expect(scored.ok).toBe(true);
  });
});
