import type {
  OutputEvidencePolarity,
  OutputLearningConfidenceLevel,
  OutputLearningEvidenceRef,
} from "./types";

export function evidenceStrengthWeight(strength: string): number {
  switch (strength) {
    case "strong":
      return 1;
    case "medium":
      return 0.6;
    case "weak":
      return 0.3;
    default:
      return 0.5;
  }
}

export function weightedEvidenceCount(evidence: OutputLearningEvidenceRef[]): number {
  return evidence.reduce(
    (sum, item) => sum + evidenceStrengthWeight(item.strength),
    0
  );
}

export function computeOutputLearningConfidence(
  supporting: OutputLearningEvidenceRef[],
  contradicting: OutputLearningEvidenceRef[]
): { confidence: OutputLearningConfidenceLevel; confidenceScore: string } {
  const supportWeight = weightedEvidenceCount(supporting);
  const contradictWeight = weightedEvidenceCount(contradicting);

  if (supportWeight === 0 && contradictWeight === 0) {
    return { confidence: "low", confidenceScore: "0.0000" };
  }

  let score = Math.min(1, supportWeight * 0.25 + Math.min(supporting.length * 0.1, 0.35));

  if (contradictWeight > 0) {
    score *= Math.max(0.2, 1 - contradictWeight * 0.25);
  }

  const confidence: OutputLearningConfidenceLevel =
    score >= 0.7 && contradictWeight === 0
      ? "high"
      : score >= 0.4
        ? "medium"
        : "low";

  return { confidence, confidenceScore: score.toFixed(4) };
}

export function shouldApproveOutputLearning(
  supporting: OutputLearningEvidenceRef[],
  contradicting: OutputLearningEvidenceRef[],
  confidence: OutputLearningConfidenceLevel,
  preferenceDirection: "prefer" | "avoid"
): boolean {
  const supportWeight = weightedEvidenceCount(supporting);
  const contradictWeight = weightedEvidenceCount(contradicting);

  if (supportWeight === 0) return false;
  if (supportWeight <= contradictWeight) return false;

  if (preferenceDirection === "avoid") {
    return supporting.length >= 1 && confidence !== "low";
  }

  return confidence !== "low" || supporting.length >= 2;
}

export function shouldSupersedeOutputLearning(
  supporting: OutputLearningEvidenceRef[],
  contradicting: OutputLearningEvidenceRef[]
): boolean {
  const supportWeight = weightedEvidenceCount(supporting);
  const contradictWeight = weightedEvidenceCount(contradicting);
  return contradictWeight > 0 && contradictWeight >= supportWeight;
}

export function resolvePolarityForVariable(input: {
  variableKey: string;
  direction: string;
}): OutputEvidencePolarity {
  if (input.variableKey === "avoid_pattern") {
    return input.direction === "negative" || input.direction === "corrective"
      ? "supporting"
      : "contradicting";
  }

  if (input.direction === "positive") return "supporting";
  return "contradicting";
}
