import { FIDELITY_HARD_FAILURE_CODES } from "../../ai/creative-validation-aggregation";
import type { CreativeHardFailureCode } from "../../ai/creative-quality-gate";
import type { HumanQualityFailureReason } from "../corpus";
import type { CalibrationComparison } from "./types";

export type AdjustmentTargetModule =
  | "score_ceiling"
  | "observable_rubric"
  | "gate_classifier";

export interface AdjustmentTarget {
  targetModule: AdjustmentTargetModule;
  targetKey: string;
}

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

const RUBRIC_TARGET_KEYS = new Set([
  "VISUAL_OVERLOAD_RUBRIC",
  "GENERIC_TEMPLATE_RUBRIC",
  "MISSING_DOMINANT_IDEA_MARKERS",
]);

const SCORE_CEILING_TARGET_KEYS = new Set([
  "visual_overload",
  "missing_dominant_idea",
  "generic_template_aesthetic",
  "decorative_only_variation",
  "cta_drift",
  "unreadable_required_text",
  "invalid_format_layout",
  "cropped_critical_content",
]);

export function resolveAdjustmentTarget(
  reason: HumanQualityFailureReason
): AdjustmentTarget | null {
  if (reason === "other") {
    return null;
  }

  const gateTargets = resolveGateTargets(reason);
  if (gateTargets.length === 0) {
    return null;
  }

  if (reason === "factual_issue") {
    return {
      targetModule: "gate_classifier",
      targetKey: gateTargets[0],
    };
  }

  const ceilingKey = gateTargets.find((key) => SCORE_CEILING_TARGET_KEYS.has(key));
  if (ceilingKey) {
    return { targetModule: "score_ceiling", targetKey: ceilingKey };
  }

  const rubricKey = gateTargets.find((key) => RUBRIC_TARGET_KEYS.has(key));
  if (rubricKey) {
    return { targetModule: "observable_rubric", targetKey: rubricKey };
  }

  return {
    targetModule: "gate_classifier",
    targetKey: gateTargets[0],
  };
}

export function detectHumanGateMismatch(comparison: CalibrationComparison): boolean {
  if (comparison.primaryFailureReason !== "factual_issue") {
    return false;
  }

  return !comparison.hardFailureCodes.some((code) =>
    FIDELITY_HARD_FAILURE_CODES.has(code as CreativeHardFailureCode)
  );
}
