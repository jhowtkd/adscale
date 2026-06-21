import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";
import type {
  HumanQualityFailureReason,
  HumanQualityIntent,
  HumanQualityQualitySnapshot,
  HumanQualitySourceLabel,
} from "./corpus";

export const HUMAN_QUALITY_FEEDBACK_ARTIFACT_SCHEMA_VERSION = 1 as const;

export interface HumanQualityFeedbackArtifactPayload {
  schemaVersion: typeof HUMAN_QUALITY_FEEDBACK_ARTIFACT_SCHEMA_VERSION;
  evaluation: {
    visualScore: number;
    factualPass: boolean;
    intent: HumanQualityIntent;
    primaryFailureReason: HumanQualityFailureReason;
    otherReasonText?: string | null;
  };
  corpusContext: {
    cohort: string;
    generationMode: string;
    format: string;
    corpusVersion: number;
    qualityScore?: number | null;
    qualityVerdict?: string | null;
  };
  improvementTargets: string[];
}

const IMPROVEMENT_TARGETS_BY_FAILURE: Record<HumanQualityFailureReason, string[]> = {
  visual_overload: ["reduce_visual_density", "strengthen_focal_point"],
  weak_hierarchy: ["improve_visual_hierarchy", "clarify_primary_message"],
  generic_template_feel: ["increase_brand_specificity", "reduce_template_defaults"],
  illegible_cta: ["improve_cta_legibility", "increase_cta_contrast"],
  unfocused_composition: ["tighten_composition", "reduce_competing_elements"],
  factual_issue: ["tighten_factual_grounding", "verify_claim_alignment"],
  format_or_crop_issue: ["fix_format_crop", "validate_safe_zones"],
  other: ["review_other_failure"],
};

export function buildHumanQualityFeedbackArtifactPayload(input: {
  item: HumanQualityCorpusItem;
  evaluation: HumanQualityEvaluation;
}): HumanQualityFeedbackArtifactPayload {
  const snapshot = input.item.qualitySnapshot as HumanQualityQualitySnapshot;
  const failureReason = input.evaluation.primaryFailureReason as HumanQualityFailureReason;
  const intent = input.evaluation.intent as HumanQualityIntent;

  const improvementTargets = [...(IMPROVEMENT_TARGETS_BY_FAILURE[failureReason] ?? [])];
  if (intent === "regenerate") {
    improvementTargets.push("regenerate_with_human_direction");
  }
  if (!input.evaluation.factualPass) {
    improvementTargets.push("address_factual_failure");
  }

  return {
    schemaVersion: HUMAN_QUALITY_FEEDBACK_ARTIFACT_SCHEMA_VERSION,
    evaluation: {
      visualScore: input.evaluation.visualScore,
      factualPass: input.evaluation.factualPass,
      intent,
      primaryFailureReason: failureReason,
      otherReasonText: input.evaluation.otherReasonText,
    },
    corpusContext: {
      cohort: input.item.cohort,
      generationMode: input.item.generationMode,
      format: input.item.format,
      corpusVersion: input.item.corpusVersion,
      qualityScore: snapshot?.qualityScore ?? null,
      qualityVerdict: snapshot?.qualityVerdict ?? null,
    },
    improvementTargets: [...new Set(improvementTargets)].slice(0, 10),
  };
}

export function resolveCorpusSourceLabel(
  candidateSourceLabel: string | null | undefined
): HumanQualitySourceLabel {
  if (
    candidateSourceLabel === "synthetic_fixture" ||
    candidateSourceLabel === "operator_imported" ||
    candidateSourceLabel === "real_customer"
  ) {
    return candidateSourceLabel;
  }
  return "operator_imported";
}
