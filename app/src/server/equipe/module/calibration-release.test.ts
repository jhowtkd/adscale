import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import type { EquipeFrontKey } from "../data";
import { seedStaff } from "./testing/deps";
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
  type CalibrationIds,
  type TestDeps,
} from "./testing/calibration";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const WEEK_1 = new Date("2026-10-05T14:00:00.000Z");

async function passThreeWeeks(
  t: TestDeps,
  ids: CalibrationIds,
  front: EquipeFrontKey = "social_instagram",
): Promise<string> {
  for (let week = 0; week < 3; week += 1) {
    setNow(t, new Date(WEEK_1.getTime() + week * WEEK));
    const round = await openTestRound(t, ids, { front });
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await approveAll(t, ids, round.itemIds);
    await closeTestRound(t, ids, round.roundId);
  }
  return frontIdOf(t, ids, front);
}

describe("release_front", () => {
  it("refuses before 3 consecutive passes and with a round still open", async () => {
    const { t, ids } = await setupCalibration();
    setNow(t, WEEK_1);
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await approveAll(t, ids, round.itemIds);
    await closeTestRound(t, ids, round.roundId);
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: round.frontId },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("release_requires_3_consecutive");
    setNow(t, new Date(WEEK_1.getTime() + WEEK));
    await openTestRound(t, ids);
    const open = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: round.frontId },
    });
    expect(open.ok).toBe(false);
    if (open.ok) return;
    expect(open.error.code).toBe("round_still_open");
  });

  it("releases after 3 passes, activates the account and starts billing", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await passThreeWeeks(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId, notes: "steady voice" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toEqual({ frontId, accountActivated: true });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "front.released",
      "account.activated",
      "billing.subscription_started",
      "notification.requested",
    ]);
    const account = await t.deps.uow.repos.accounts.get(ids.workspaceId, ids.accountId);
    expect(account?.status).toBe("active");
    expect(await frontStatusOf(t, ids, frontId)).toMatchObject({ status: "released" });
    const released = outcome.value.events[0]!;
    expect(released.payload).toMatchObject({
      releasedBy: (ids.actors.quality as { staffId: string }).staffId,
      releasedByName: "quality",
      notes: "steady voice",
    });
    const grades = (released.payload as { grades: Array<{ outcome: string }> }).grades;
    expect(grades).toHaveLength(3);
    expect(grades.every((grade) => grade.outcome === "passed")).toBe(true);
    expect(outcome.value.events[2]!.payload).toEqual({
      releasedFrontId: frontId,
      installment: 3,
      monthlyFee: "full",
    });
  });

  it("carries loosenings into the release record", async () => {
    const { t, ids } = await setupCalibration();
    setNow(t, WEEK_1);
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "request_adjustment",
      payload: { itemId: round.itemIds[0]!, category: "fact" },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "classify_rejection",
      payload: {
        roundId: round.roundId,
        itemId: round.itemIds[0]!,
        category: "taste",
        evidence: "source confirms it",
      },
    });
    await approveAll(t, ids, round.itemIds.slice(1));
    await closeTestRound(t, ids, round.roundId);
    for (let week = 1; week < 3; week += 1) {
      setNow(t, new Date(WEEK_1.getTime() + week * WEEK));
      const next = await openTestRound(t, ids);
      await scoreAll(t, ids, next.roundId, next.itemIds);
      await approveAll(t, ids, next.itemIds);
      await closeTestRound(t, ids, next.roundId);
    }
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: round.frontId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const loosenings = (
      outcome.value.events[0]!.payload as { loosenings: Array<Record<string, unknown>> }
    ).loosenings;
    expect(loosenings).toHaveLength(1);
    expect(loosenings[0]).toMatchObject({
      itemId: round.itemIds[0],
      from: "fact",
      to: "taste",
      evidence: "source confirms it",
    });
  });

  it("emits the billing event only for the first released front", async () => {
    const { t, ids } = await setupCalibration();
    await passThreeWeeks(t, ids, "social_instagram");
    const socialId = await frontIdOf(t, ids, "social_instagram");
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: socialId },
    });
    expect(first.ok).toBe(true);
    for (let week = 3; week < 6; week += 1) {
      setNow(t, new Date(WEEK_1.getTime() + week * WEEK));
      const round = await openTestRound(t, ids, { front: "midia_paga" });
      await scoreAll(t, ids, round.roundId, round.itemIds);
      await approveAll(t, ids, round.itemIds);
      await closeTestRound(t, ids, round.roundId);
    }
    const paidId = await frontIdOf(t, ids, "midia_paga");
    const second = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: paidId },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.data).toEqual({ frontId: paidId, accountActivated: false });
    expect(second.value.events.map((e) => e.eventType)).toEqual([
      "front.released",
      "notification.requested",
    ]);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    const billing = await t.deps.uow.repos.events.list(scope, {
      eventType: "billing.subscription_started",
    });
    expect(billing).toHaveLength(1);
  });

  it("only an active quality staffer releases; agent, system and clients cannot", async () => {
    const { t, ids } = await setupCalibration();
    const frontId = await passThreeWeeks(t, ids);
    for (const actor of [
      ids.actors.agent,
      ids.actors.system,
      ids.actors.approver,
      ids.actors.support,
    ]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "release_front",
        payload: { frontId },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
    const inactive = await seedStaff(t, "quality", { active: false });
    const gone = await executeCommand(t.deps, ctx(ids, inactive), {
      type: "release_front",
      payload: { frontId },
    });
    expect(gone.ok).toBe(false);
    if (gone.ok) return;
    expect(gone.error.code).toBe("forbidden_actor");
  });
});

describe("reopen_calibration", () => {
  it("reopens only that front after a critical post-release failure", async () => {
    const { t, ids } = await setupCalibration();
    const socialId = await passThreeWeeks(t, ids, "social_instagram");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: socialId },
    });
    const paidId = await frontIdOf(t, ids, "midia_paga");
    const escalationId = "11111111-1111-4111-8111-111111111111";
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "reopen_calibration",
      payload: { frontId: socialId, reason: "critical content failure", escalationId },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "front.recalibration_opened",
      "notification.requested",
    ]);
    expect(outcome.value.events[0]!.payload).toMatchObject({
      reason: "critical content failure",
      escalationId,
    });
    expect(await frontStatusOf(t, ids, socialId)).toEqual({
      status: "calibrating",
      calibrationSequence: 0,
      roundsUsed: 0,
    });
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect((await t.deps.uow.repos.fronts.get(scope, socialId))?.releasedAt).toBeNull();
    expect((await t.deps.uow.repos.fronts.get(scope, paidId))?.status).toBe("draft");
    expect((await t.deps.uow.repos.accounts.get(ids.workspaceId, ids.accountId))?.status).toBe(
      "active",
    );
  });

  it("lets the reopened front calibrate again the next week", async () => {
    const { t, ids } = await setupCalibration();
    const socialId = await passThreeWeeks(t, ids, "social_instagram");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_front",
      payload: { frontId: socialId },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "reopen_calibration",
      payload: { frontId: socialId, reason: "critical content failure" },
    });
    setNow(t, new Date(WEEK_1.getTime() + 3 * WEEK));
    const round = await openTestRound(t, ids);
    expect(round.sequence).toBe(4);
    await scoreAll(t, ids, round.roundId, round.itemIds);
    await approveAll(t, ids, round.itemIds);
    const closed = await closeTestRound(t, ids, round.roundId);
    expect(closed).toMatchObject({ outcome: "passed", consecutivePasses: 1 });
  });

  it("refuses fronts that are not released, and refuses agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "reopen_calibration",
      payload: { frontId: round.frontId, reason: "nothing released" },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("invalid_transition");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "reopen_calibration",
      payload: { frontId: round.frontId, reason: "from the IA" },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
  });
});
