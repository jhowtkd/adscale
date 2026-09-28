import { describe, expect, it } from "vitest";
import { executeCommand } from "./commands";
import {
  ctx,
  openTestRound,
  scoreAll,
  setupCalibration,
  submitCorrection,
} from "./testing/calibration";

describe("mark_critical_failure", () => {
  it("marks the failure and tells the strategist", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await scoreAll(t, ids, round.roundId, [itemId]);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId, reason: "invented price" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.data).toEqual({ itemId });
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "round.critical_failure",
      "notification.requested",
    ]);
  });

  it("needs the attempt score first and marks only once", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    const early = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId, reason: "too early" },
    });
    expect(early.ok).toBe(false);
    if (early.ok) return;
    expect(early.error.code).toBe("unscored_item");
    await scoreAll(t, ids, round.roundId, [itemId]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId, reason: "wrong person" },
    });
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId, reason: "again" },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("already_marked");
  });

  it("stands even with a correction pending, but not after release", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const [returnedId, releasedId] = round.itemIds;
    await scoreAll(t, ids, round.roundId, [returnedId!, releasedId!]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId: returnedId!, note: "fix" },
    });
    const pending = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId: returnedId!, reason: "wrong account" },
    });
    expect(pending.ok).toBe(true);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId: releasedId! },
    });
    const late = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId: releasedId!, reason: "too late" },
    });
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.error.code).toBe("already_released");
  });

  it("refuses agents and clients", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    await scoreAll(t, ids, round.roundId, [round.itemIds[0]!]);
    for (const actor of [ids.actors.agent, ids.actors.system, ids.actors.approver]) {
      const outcome = await executeCommand(t.deps, ctx(ids, actor), {
        type: "mark_critical_failure",
        payload: { roundId: round.roundId, itemId: round.itemIds[0]!, reason: "x" },
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe("forbidden_actor");
    }
  });
});

describe("withdraw_round_item", () => {
  it("withdraws after a failed correction and unlinks the batch", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const itemId = round.itemIds[0]!;
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: {
        roundId: round.roundId,
        itemId,
        facts: 2,
        brand: 2,
        usefulness: 2,
        execution: 2,
      },
    });
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId, note: "fix" },
    });
    await submitCorrection(t, ids, itemId, "still off");
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId, reason: "correction still off" },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.events.map((e) => e.eventType)).toEqual([
      "round.item_withdrawn",
      "notification.requested",
    ]);
    const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
    expect((await t.deps.uow.repos.items.get(scope, itemId))?.batchId).toBeNull();
  });

  it("refuses without a return, before the correction, twice, and for agents", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const [plainId, pendingId] = round.itemIds;
    await scoreAll(t, ids, round.roundId, [plainId!, pendingId!]);
    const noReturn = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: plainId! },
    });
    expect(noReturn.ok).toBe(false);
    if (noReturn.ok) return;
    expect(noReturn.error.code).toBe("no_return");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "return_item_for_fix",
      payload: { roundId: round.roundId, itemId: pendingId!, note: "fix" },
    });
    const pending = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: pendingId! },
    });
    expect(pending.ok).toBe(false);
    if (pending.ok) return;
    expect(pending.error.code).toBe("correction_pending");
    await submitCorrection(t, ids, pendingId!, "corrected");
    const first = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: pendingId! },
    });
    expect(first.ok).toBe(true);
    const again = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: pendingId! },
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("already_withdrawn");
    const agent = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: plainId! },
    });
    expect(agent.ok).toBe(false);
    if (agent.ok) return;
    expect(agent.error.code).toBe("forbidden_actor");
  });

  it("refuses to withdraw critical or released items", async () => {
    const { t, ids } = await setupCalibration();
    const round = await openTestRound(t, ids);
    const [criticalId, releasedId] = round.itemIds;
    await scoreAll(t, ids, round.roundId, [criticalId!, releasedId!]);
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "mark_critical_failure",
      payload: { roundId: round.roundId, itemId: criticalId!, reason: "bad" },
    });
    const critical = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: criticalId! },
    });
    expect(critical.ok).toBe(false);
    if (critical.ok) return;
    expect(critical.error.code).toBe("item_critical");
    await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId: round.roundId, itemId: releasedId! },
    });
    const released = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "withdraw_round_item",
      payload: { roundId: round.roundId, itemId: releasedId! },
    });
    expect(released.ok).toBe(false);
    if (released.ok) return;
    expect(released.error.code).toBe("already_released");
  });
});
