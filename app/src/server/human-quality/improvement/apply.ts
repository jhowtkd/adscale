import { HUMAN_QUALITY_FAILURE_REASONS, type HumanQualityFailureReason } from "../corpus";
import { MIN_SLICE_SAMPLE } from "../calibration/report";
import {
  resolveAdjustmentTarget,
  resolveGateTargets,
} from "../calibration/failure-bridge";
import { listAcceptedAdjustments } from "../../repositories/rubric-calibration-adjustments";
import type { ApplyPlanItem } from "./types";

export type { ApplyPlanItem, QualityImprovementChangeSpec } from "./types";
export { TARGETED_VISUAL_FAILURE_REASONS } from "./types";

function parseFailureReasonFromSliceKey(sliceKey: string): HumanQualityFailureReason | null {
  const reason = sliceKey.split("|")[0];
  if (
    HUMAN_QUALITY_FAILURE_REASONS.includes(reason as HumanQualityFailureReason)
  ) {
    return reason as HumanQualityFailureReason;
  }
  return null;
}

export function computeBoundedCeiling(currentCeiling: number, delta: number): number {
  const clampedDelta = Math.max(-5, Math.min(5, delta));
  return Math.max(0, Math.min(100, currentCeiling + clampedDelta));
}

export async function buildApplyPlan(
  adjustmentVersion: string
): Promise<ApplyPlanItem[]> {
  const acceptedRows = await listAcceptedAdjustments({ adjustmentVersion });
  const plan: ApplyPlanItem[] = [];

  for (const row of acceptedRows) {
    if (row.status !== "accepted") {
      continue;
    }

    if (row.evidenceRefs.corpusItemIds.length < MIN_SLICE_SAMPLE) {
      continue;
    }

    const primaryFailureReason = parseFailureReasonFromSliceKey(row.sliceKey);
    if (!primaryFailureReason) {
      continue;
    }

    const target = resolveAdjustmentTarget(primaryFailureReason);
    if (!target) {
      continue;
    }

    plan.push({
      adjustmentId: row.id,
      adjustmentVersion: row.adjustmentVersion,
      sliceKey: row.sliceKey,
      primaryFailureReason,
      targetModule: target.targetModule,
      targetKey: target.targetKey,
      gateTargets: resolveGateTargets(primaryFailureReason),
      evidenceRefs: row.evidenceRefs,
      changeSpec: row.changeSpec,
      applyKind:
        primaryFailureReason === "factual_issue" ? "factual_guard_only" : "full",
    });
  }

  return plan;
}
