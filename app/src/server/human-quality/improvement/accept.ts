import { db } from "../../db";
import {
  acceptAdjustment,
  findAdjustmentById,
  supersedeAcceptedForSlice,
} from "../../repositories/rubric-calibration-adjustments";
import type { AcceptAdjustmentInput } from "./types";

export type { AcceptAdjustmentInput } from "./types";

export async function acceptProposedAdjustment(input: AcceptAdjustmentInput) {
  const row = await findAdjustmentById(input.adjustmentId);

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
