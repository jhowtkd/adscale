import { FIDELITY_HARD_FAILURE_CODES } from "../../ai/creative-validation-aggregation";
import type { CreativeHardFailureCode } from "../../ai/creative-quality-gate";
import type { HumanQualityFailureReason } from "../corpus";
import type { CalibrationComparison } from "./types";

const FAILURE_REASON_GATE_TARGETS: Record<HumanQualityFailureReason, readonly string[]> = {
  visual_overload: ["visual_overload", "VISUAL_OVERLOAD_RUBRIC"],
  weak_hierarchy: ["missing_dominant_idea", "MISSING_DOMINANT_IDEA_MARKERS"],
  generic_template_feel: ["generic_template_aesthetic", "GENERIC_TEMPLATE_RUBRIC"],
  illegible_cta: ["unreadable_required_text", "cta_drift"],
  unfocused_composition: ["missing_dominant_idea", "decorative_only_variation"],
  factual_issue: [...FIDELITY_HARD_FAILURE_CODES],
  format_or_crop_issue: ["invalid_format_layout", "cropped_critical_content"],
  other: [],
};

export function resolveGateTargets(reason: HumanQualityFailureReason): string[] {
  return [...FAILURE_REASON_GATE_TARGETS[reason]];
}

export function detectHumanGateMismatch(comparison: CalibrationComparison): boolean {
  if (comparison.primaryFailureReason !== "factual_issue") {
    return false;
  }

  return !comparison.hardFailureCodes.some((code) =>
    FIDELITY_HARD_FAILURE_CODES.has(code as CreativeHardFailureCode)
  );
}
