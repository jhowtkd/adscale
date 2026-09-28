import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import { calibrationGateSlice } from "./calibration-shared";
import { evaluatePublicationGate } from "../domain";
import { seedStaff, testActors } from "./testing/deps";
import {
  ctx,
  openTestRound,
  PASS_RUBRIC,
  scoreAll,
  setupCalibration,
  submitCorrection,
} from "./testing/calibration";
import { deliverTestBatch } from "./testing/items";

describe("score_attempt", () => {
  it("scores the first AI version even after the client edits the caption", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "edit_caption",
      payload: { itemId, caption: "client rewrite" },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId, ...PASS_RUBRIC },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({
      versionHash: round.versionHashes[0],
      total: 15,
      minDimension: 3,
      verdict: "pass",
    });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual(["round.item_scored"]);
  });

  it("fails below 14 total or with any dimension below 3", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const cases = [
      { rubric: { facts: 4, brand: 4, usefulness: 2, execution: 4 }, verdict: "fail" },
      { rubric: { facts: 3, brand: 3, usefulness: 3, execution: 3 }, verdict: "fail" },
      { rubric: { facts: 4, brand: 4, usefulness: 3, execution: 3 }, verdict: "pass" },
    ];
    for (const [index, { rubric, verdict }] of cases.entries()) {
      const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
        type: "score_attempt",
        payload: { roundId: round.roundId, itemId: round.itemIds[index]!, ...rubric },
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.data).toMatchObject({ verdict });
    }
  });

  it("records who scored and refuses a second score", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId, ...PASS_RUBRIC, feedback: "boa" },
    });
    expect(first.ok).toBe(true);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const scores = await t.deps.uow.repos.calibrationScores.list(scope);
    expect(scores[0]).toMatchObject({
      feedback: "boa",
      scoredBy: (ids.actors.quality as { staffId: string }).staffId,
    });
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId, ...PASS_RUBRIC },
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("already_scored");
  });

  it("rejects dimensions outside 0–4 and items outside the round", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const bad = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId: round.itemIds[0]!, ...PASS_RUBRIC, facts: 5 },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("invalid_command");
    const other = await deliverTestBatch(t, ids, { items: [{}] });
    const foreign = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId: round.roundId, itemId: other.itemIds[0]!, ...PASS_RUBRIC },
    });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.code).toBe("item_not_in_round");
  });

  it("only an active quality staffer scores; agent, system and clients cannot", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const payload = { roundId: round.roundId, itemId: round.itemIds[0]!, ...PASS_RUBRIC };
    for (const actor of [
      ids.actors.agent,
      ids.actors.system,
      ids.actors.approver,
      ids.actors.member,
      ids.actors.support,
      ids.actors.operations,
    ]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "score_attempt",
        payload,
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    // Unknown and inactive staff are rejected at binding.
    const stranger = await executeCommand(t.deps, ctx(ids, testActors.quality!), {
      type: "score_attempt",
      payload,
    });
    expect(stranger.ok).toBe(false);
    const inactive = await seedStaff(t, "quality", { active: false });
    const gone = await executeCommand(t.deps, ctx(ids, inactive), {
      type: "score_attempt",
      payload,
    });
    expect(gone.ok).toBe(false);
    if (gone.ok) return;
    expect(gone.error.code).toBe("forbidden_actor");
  });
});

describe("return_item_for_fix", () => {
  it("returns once per item and asks the IA for a correction", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await scoreAll(t, ids, round.roundId, [itemId]);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "fix the price" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "round.item_returned",
      "agent_work.requested",
    ]);
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "once more" },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("already_returned");
  });

  it("refuses to return an unscored item, and refuses agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const unscored = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "too early" },
    });
    expect(unscored.ok).toBe(false);
    if (unscored.ok) return;
    expect(unscored.error.code).toBe("unscored_item");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "from the IA" },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
  });
});

describe("release_item_to_client", () => {
  it("releases a passing attempt as-is", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await scoreAll(t, ids, round.roundId, [itemId]);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toMatchObject({ corrected: false });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual(["round.item_released"]);
  });

  it("refuses 'liberar como está' with any dimension below 3", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: {
        roundId: round.roundId,
        itemId,
        facts: 4,
        brand: 4,
        usefulness: 2,
        execution: 4,
      },
    });
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("release_blocked_low_score");
  });

  it("releases the corrected version after a return, once it arrives", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: {
        roundId: round.roundId,
        itemId,
        facts: 4,
        brand: 4,
        usefulness: 2,
        execution: 4,
      },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "fix it" },
    });
    const pending = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(pending.ok).toBe(false);
    if (pending.ok) return;
    expect(pending.error.code).toBe("correction_pending");
    await submitCorrection(t, ids, itemId, "fixed caption");
    const released = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.value.data).toMatchObject({ corrected: true });
  });

  it("refuses to release twice, and refuses agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await scoreAll(t, ids, round.roundId, [itemId]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("already_released");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId: round.itemIds[1]! },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
  });
});

describe("calibration conference in the publication gate", () => {
  function snapshot(overrides: Record<string, unknown> = {}) {
    return {
      mandateApproved: true,
      connection: "verified" as const,
      manualMode: false,
      approval: { approvedVersionHash: "v1" },
      currentVersionHash: "v1",
      calibrationCheckRequired: false,
      qualityChecked: false,
      now: new Date("2026-10-06T14:00:00.000Z"),
      publishedThisWeek: 0,
      publishedThisMonth: 0,
      effectivePause: null,
      blockingEscalationOpen: false,
      offer: null,
      ...overrides,
    };
  }

  it("blocks dispatch of an unreleased item on a calibrating front", () => {
    const slice = calibrationGateSlice({ frontStatus: "calibrating", releasedToClient: false });
    expect(slice).toEqual({ calibrationCheckRequired: true, qualityChecked: false });
    const gate = evaluatePublicationGate(snapshot({ ...slice }));
    expect(gate).toEqual({ allowed: false, reasons: ["calibration_check_missing"] });
  });

  it("lets a released item through and skips the check once released", () => {
    const checked = calibrationGateSlice({ frontStatus: "calibrating", releasedToClient: true });
    expect(evaluatePublicationGate(snapshot({ ...checked }))).toEqual({ allowed: true });
    const freed = calibrationGateSlice({ frontStatus: "released", releasedToClient: false });
    expect(freed.calibrationCheckRequired).toBe(false);
    expect(evaluatePublicationGate(snapshot({ ...freed }))).toEqual({ allowed: true });
  });
});
