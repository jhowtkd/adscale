import { z } from "zod";

import type { CalibrationAdjustmentEvidence } from "../calibration/types";
import type { AdjustmentTargetModule } from "../../repositories/rubric-calibration-adjustments";
import type { HumanQualityFailureReason } from "../../corpus";

export const qualityImprovementChangeSpecSchema = z.object({
  ceilingDelta: z.number().min(-5).max(5).optional(),
  rubricTightening: z.enum(["minor", "moderate"]).optional(),
  gateMarkerAdditions: z.array(z.string().min(1).max(200)).max(10).optional(),
});

export type QualityImprovementChangeSpec = z.infer<typeof qualityImprovementChangeSpecSchema>;

export interface AcceptAdjustmentInput {
  adjustmentId: string;
  reviewerUserId: string;
  changeSpec?: QualityImprovementChangeSpec;
}

export type ApplyKind = "full" | "factual_guard_only";

export interface ApplyPlanItem {
  adjustmentId: string;
  adjustmentVersion: string;
  sliceKey: string;
  primaryFailureReason: HumanQualityFailureReason;
  targetModule: AdjustmentTargetModule;
  targetKey: string;
  gateTargets: string[];
  evidenceRefs: CalibrationAdjustmentEvidence;
  changeSpec?: QualityImprovementChangeSpec | null;
  applyKind: ApplyKind;
}

export const TARGETED_VISUAL_FAILURE_REASONS = [
  "visual_overload",
  "weak_hierarchy",
  "generic_template_feel",
  "illegible_cta",
  "unfocused_composition",
] as const satisfies readonly HumanQualityFailureReason[];
