import type { HumanQualityEvaluation } from "../../db/schema";
import type { HumanQualityCorpusItem } from "../../db/schema";
import type { HumanQualityFailureReason } from "../corpus";
import { isHumanQualityFailureReason } from "../corpus";
import type { CalibrationComparison, EvaluatedCorpusRow } from "./types";

export const DIVERGENCE_FLAG_THRESHOLD = 15;

const MAX_HARD_FAILURE_CODES = 20;

function extractHardFailureCodes(
  snapshot: HumanQualityCorpusItem["qualitySnapshot"]
): string[] {
  const codes = (snapshot?.hardFailures ?? [])
    .map((failure) => failure.code)
    .filter((code): code is string => typeof code === "string" && code.length > 0)
    .slice(0, MAX_HARD_FAILURE_CODES);

  return codes;
}

function resolvePrimaryFailureReason(
  value: string
): HumanQualityFailureReason {
  return isHumanQualityFailureReason(value) ? value : "other";
}

export function buildComparison(
  item: HumanQualityCorpusItem,
  evaluation: HumanQualityEvaluation
): CalibrationComparison {
  const automaticQualityScore = item.qualitySnapshot?.qualityScore ?? null;
  const humanVisualScore = evaluation.visualScore;
  const scoreDelta =
    automaticQualityScore === null ? null : automaticQualityScore - humanVisualScore;

  return {
    corpusItemId: item.id,
    derivationId: item.derivationId,
    generationMode: item.generationMode,
    format: item.format,
    cohort: item.cohort,
    automaticQualityScore,
    humanVisualScore,
    scoreDelta,
    absError: scoreDelta === null ? null : Math.abs(scoreDelta),
    primaryFailureReason: resolvePrimaryFailureReason(evaluation.primaryFailureReason),
    factualPass: evaluation.factualPass,
    qualityVerdict: item.qualitySnapshot?.qualityVerdict ?? null,
    hardFailureCodes: extractHardFailureCodes(item.qualitySnapshot),
  };
}

export function buildCalibrationComparisons(
  rows: EvaluatedCorpusRow[]
): CalibrationComparison[] {
  return rows.map((row) => buildComparison(row.item, row.evaluation));
}
