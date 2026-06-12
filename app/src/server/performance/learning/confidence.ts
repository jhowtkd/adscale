import type { LearningConfidenceLevel, LearningEvidenceRef } from "./types";

export function computeLearningConfidence(
  supporting: LearningEvidenceRef[],
  contradicting: LearningEvidenceRef[]
): { confidence: LearningConfidenceLevel; confidenceScore: string } {
  const supportCount = supporting.length;
  const contradictCount = contradicting.length;

  if (supportCount === 0) {
    return { confidence: "low", confidenceScore: "0.0000" };
  }

  const impressions = supporting.reduce((sum, item) => sum + item.impressions, 0);
  let score = Math.min(1, supportCount * 0.2 + Math.min(impressions / 10_000, 0.45));

  if (contradictCount > 0) {
    score *= Math.max(0.25, 1 - contradictCount * 0.2);
  }

  const confidence: LearningConfidenceLevel =
    score >= 0.7 && contradictCount === 0
      ? "high"
      : score >= 0.4
        ? "medium"
        : "low";

  return { confidence, confidenceScore: score.toFixed(4) };
}

export function shouldApproveLearning(
  supporting: LearningEvidenceRef[],
  contradicting: LearningEvidenceRef[],
  confidence: LearningConfidenceLevel
): boolean {
  if (supporting.length === 0) return false;
  if (supporting.length <= contradicting.length) return false;
  return confidence !== "low" || supporting.length >= 2;
}
