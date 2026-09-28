// Shared fixtures for the calibration command tests (#546): account in
// calibration, round-sized batches delivered and opened through the real
// executeCommand path, bulk scoring/approval, and clock control.

import { fixedClock } from "../../domain";
import type { EquipeFrontKey } from "../../data";
import { executeCommand } from "../commands";
import {
  ctx,
  deliverTestBatch,
  frontIdOf,
  makeTestDeps,
  setup,
  uuid,
  type ItemIds,
  type TestDeps,
} from "./items";

export type CalibrationIds = ItemIds;

export { ctx, frontIdOf, makeTestDeps, setup, uuid };
export type { ItemIds, TestDeps };

export function setNow(t: TestDeps, now: Date): void {
  t.deps.clock = fixedClock(now);
}

/** Open an account and move it straight into calibration. */
export async function setupCalibration(fronts: EquipeFrontKey[] = ["social_instagram", "midia_paga"]) {
  const { t, ids } = await setup(fronts);
  await t.deps.uow.repos.accounts.update(ids.workspaceId, ids.accountId, { status: "calibrating" });
  return { t, ids };
}

export type OpenTestRoundResult = {
  batchId: string;
  itemIds: string[];
  versionHashes: string[];
  roundId: string;
  sequence: number;
  weekKey: string;
  frontId: string;
};

/** Deliver a round-sized batch and open its round through open_round. */
export async function openTestRound(
  t: TestDeps,
  ids: CalibrationIds,
  options: { front?: EquipeFrontKey; count?: number } = {},
): Promise<OpenTestRoundResult> {
  const front = options.front ?? "social_instagram";
  const count = options.count ?? (front === "social_instagram" ? 4 : 3);
  const frontId = await frontIdOf(t, ids, front);
  const delivered = await deliverTestBatch(t, ids, {
    front,
    items: Array.from({ length: count }, (_, index) => ({
      caption: `post ${index + 1}`,
      scheduledFor: new Date("2026-10-09T12:00:00.000Z"),
    })),
  });
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "open_round",
    payload: { frontId, batchId: delivered.batchId },
  });
  if (!outcome.ok) {
    throw new Error(`openTestRound failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  const data = outcome.value.data as { roundId: string; sequence: number; weekKey: string };
  return {
    batchId: delivered.batchId,
    itemIds: delivered.itemIds,
    versionHashes: delivered.versionHashes,
    roundId: data.roundId,
    sequence: data.sequence,
    weekKey: data.weekKey,
    frontId,
  };
}

export type RubricInput = { facts: number; brand: number; usefulness: number; execution: number };

export const PASS_RUBRIC: RubricInput = { facts: 4, brand: 4, usefulness: 3, execution: 4 };

/** Score every item of the round through score_attempt. */
export async function scoreAll(
  t: TestDeps,
  ids: CalibrationIds,
  roundId: string,
  itemIds: string[],
  rubric: RubricInput = PASS_RUBRIC,
): Promise<void> {
  for (const itemId of itemIds) {
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "score_attempt",
      payload: { roundId, itemId, ...rubric },
    });
    if (!outcome.ok) {
      throw new Error(`scoreAll failed: ${outcome.error.code} ${outcome.error.message}`);
    }
  }
}

/** Approve every item at its current version through approve_item. */
export async function approveAll(
  t: TestDeps,
  ids: CalibrationIds,
  itemIds: string[],
): Promise<void> {
  const scope = { workspaceId: ids.workspaceId, accountId: ids.accountId };
  for (const itemId of itemIds) {
    const item = await t.deps.uow.repos.items.get(scope, itemId);
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.approver), {
      type: "approve_item",
      payload: { itemId, expectedVersionHash: item?.currentVersionHash ?? "missing" },
    });
    if (!outcome.ok) {
      throw new Error(`approveAll failed: ${outcome.error.code} ${outcome.error.message}`);
    }
  }
}

/** Release every item of the round to the client. */
export async function releaseAll(
  t: TestDeps,
  ids: CalibrationIds,
  roundId: string,
  itemIds: string[],
): Promise<void> {
  for (const itemId of itemIds) {
    const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
      type: "release_item_to_client",
      payload: { roundId, itemId },
    });
    if (!outcome.ok) {
      throw new Error(`releaseAll failed: ${outcome.error.code} ${outcome.error.message}`);
    }
  }
}

/** Close the round through close_round and return its outcome data. */
export async function closeTestRound(
  t: TestDeps,
  ids: CalibrationIds,
  roundId: string,
): Promise<{ outcome: string; consecutivePasses: number; roundsCompleted: number }> {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.quality), {
    type: "close_round",
    payload: { roundId },
  });
  if (!outcome.ok) {
    throw new Error(`closeTestRound failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return outcome.value.data as {
    outcome: string;
    consecutivePasses: number;
    roundsCompleted: number;
  };
}

/**
 * Submit the IA corrected version after a return for fix, through the real
 * submit_corrected_version command (agent actor, new caption).
 */
export async function submitCorrection(
  t: TestDeps,
  ids: CalibrationIds,
  roundId: string,
  itemId: string,
  caption: string,
): Promise<string> {
  const outcome = await executeCommand(t.deps, ctx(ids, ids.actors.agent), {
    type: "submit_corrected_version",
    payload: { roundId, itemId, caption },
  });
  if (!outcome.ok) {
    throw new Error(`submitCorrection failed: ${outcome.error.code} ${outcome.error.message}`);
  }
  return (outcome.value.data as { versionHash: string }).versionHash;
}

export async function frontStatusOf(
  t: TestDeps,
  ids: CalibrationIds,
  frontId: string,
): Promise<{ status: string; calibrationSequence: number; roundsUsed: number }> {
  const front = await t.deps.uow.repos.fronts.get(
    { workspaceId: ids.workspaceId, accountId: ids.accountId },
    frontId,
  );
  if (!front) throw new Error(`missing front ${frontId}`);
  return {
    status: front.status,
    calibrationSequence: front.calibrationSequence,
    roundsUsed: front.roundsUsed,
  };
}
