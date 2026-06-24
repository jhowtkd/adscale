import { db } from "../../db";
import { CalibrationAdjustmentError } from "../../repositories/calibration-adjustment-errors";
import {
  acceptAdjustment,
  findAdjustmentById,
  supersedeAcceptedForSlice,
} from "../../repositories/rubric-calibration-adjustments";
import type { AcceptAdjustmentInput } from "./types";

export type { AcceptAdjustmentInput } from "./types";

export async function acceptProposedAdjustment(input: AcceptAdjustmentInput) {
  const row = await findAdjustmentById(input.adjustmentId);

  if (row) {
    if (
      row.evidenceRefs.promotionSource === "cross_client" &&
      row.evidenceRefs.fixtureOnly === true &&
      !input.acknowledgeFixtureOnly
    ) {
      throw new CalibrationAdjustmentError(
        "insufficient_acknowledgment",
        "Fixture-only cross-client proposal requires explicit acknowledgment"
      );
    }
  }

  if (!row) {
    return acceptAdjustment({
      adjustmentId: input.adjustmentId,
      reviewerUserId: input.reviewerUserId,
      changeSpec: input.changeSpec ?? null,
    });
  }

  return db.transaction(async () => {
    await supersedeAcceptedForSlice(
      row.sliceKey,
      row.adjustmentVersion,
      row.targetModule as "score_ceiling" | "observable_rubric" | "gate_classifier",
      row.targetKey,
      input.adjustmentId
    );

    return acceptAdjustment({
      adjustmentId: input.adjustmentId,
      reviewerUserId: input.reviewerUserId,
      changeSpec: input.changeSpec ?? null,
    });
  });
}
