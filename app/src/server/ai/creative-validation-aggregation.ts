import type { CreativeHardFailureCode } from "./creative-quality-gate";
import { CREATIVE_QA_CORE_CRITERIA } from "./creative-quality-taxonomy";
import type { CreativeScoreBreakdown } from "../repositories/derivation";

/** Fidelity-class hard failures that block QA-19 factual fidelity rate. */
export const FIDELITY_HARD_FAILURE_CODES = new Set<CreativeHardFailureCode>([
  "invented_factual_entity",
  "campaign_identity_drift",
  "style_reference_contamination",
  "wrong_brand",
  "unauthorized_brand_or_ip",
  "unsupported_offer",
  "replaced_source_subject",
]);

const QA_CHECKLIST_KEYS = CREATIVE_QA_CORE_CRITERIA;

const SCORE_BREAKDOWN_KEYS: (keyof CreativeScoreBreakdown)[] = [
  "textLegibility",
  "ctaClarity",
  "briefMatch",
  "visualQuality",
  "formatFit",
  "variationLevelFit",
  "informationPreservation",
];

export interface CreativeValidationHardFailure {
  code: string;
  message: string;
}

export interface CreativeValidationAfterCapture {
  key: string;
  source: "regenerated";
  path: string;
  sha256: string;
  qualityScore: number;
  qualityVerdict: string;
  hardFailures: CreativeValidationHardFailure[];
  qa: {
    checklist: Record<string, { status: string; note: string }>;
  };
  score: {
    scoreBreakdown: CreativeScoreBreakdown;
  };
}

export interface CreativeValidationAggregate {
  meanQualityScore: number;
  factualFidelityRate: number;
  fidelityPassCount: number;
  totalCount: number;
}

const MEAN_QUALITY_THRESHOLD = 75;
const FACTUAL_FIDELITY_THRESHOLD = 0.95;

export function capturePassesFactualFidelity(
  capture: Pick<CreativeValidationAfterCapture, "hardFailures">
): boolean {
  return !capture.hardFailures.some((failure) =>
    FIDELITY_HARD_FAILURE_CODES.has(failure.code as CreativeHardFailureCode)
  );
}

export function computeCreativeValidationAggregate(
  afterCaptures: CreativeValidationAfterCapture[]
): CreativeValidationAggregate {
  if (afterCaptures.length === 0) {
    throw new Error("computeCreativeValidationAggregate: afterCaptures must not be empty");
  }

  const totalCount = afterCaptures.length;
  const meanQualityScore =
    afterCaptures.reduce((sum, capture) => sum + capture.qualityScore, 0) / totalCount;
  const fidelityPassCount = afterCaptures.filter((capture) =>
    capturePassesFactualFidelity(capture)
  ).length;
  const factualFidelityRate = fidelityPassCount / totalCount;

  return {
    meanQualityScore,
    factualFidelityRate,
    fidelityPassCount,
    totalCount,
  };
}

export function assertThresholdsMet(aggregate: CreativeValidationAggregate): void {
  if (aggregate.meanQualityScore < MEAN_QUALITY_THRESHOLD) {
    throw new Error(
      `meanQualityScore ${aggregate.meanQualityScore.toFixed(2)} is below threshold ${MEAN_QUALITY_THRESHOLD}`
    );
  }
  if (aggregate.factualFidelityRate < FACTUAL_FIDELITY_THRESHOLD) {
    throw new Error(
      `factualFidelityRate ${aggregate.factualFidelityRate.toFixed(3)} is below threshold ${FACTUAL_FIDELITY_THRESHOLD} (${aggregate.fidelityPassCount}/${aggregate.totalCount} passed)`
    );
  }
}

/** Presence check for 6 QA checklist keys + 7 score breakdown keys (13 total). */
export function twelveCriteriaPresent(capture: CreativeValidationAfterCapture): boolean {
  const checklist = capture.qa?.checklist;
  const breakdown = capture.score?.scoreBreakdown;
  if (!checklist || !breakdown) {
    return false;
  }

  for (const key of QA_CHECKLIST_KEYS) {
    if (checklist[key] == null) {
      return false;
    }
  }

  for (const key of SCORE_BREAKDOWN_KEYS) {
    if (breakdown[key] == null) {
      return false;
    }
  }

  return true;
}
