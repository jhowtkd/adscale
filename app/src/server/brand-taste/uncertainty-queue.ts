import type { CalibrationRule } from "@/server/db/schema";
import type { BrandTasteProfile, JudgmentUncertainty } from "./calibration-signal-types";

export interface UncertaintyInput {
  profile: BrandTasteProfile | null;
  approvedRules: CalibrationRule[];
  systemOlharVerdict: string | null;
  systemExportStatus: string | null;
  isHighImpactExport?: boolean;
  priorDisagreementRate?: number | null;
}

export function classifyJudgmentUncertainty(
  input: UncertaintyInput
): JudgmentUncertainty {
  const reasons: JudgmentUncertainty["reasons"] = [];
  let score = 0;

  const profile = input.profile;
  const decisionCount = profile?.decisionCount ?? 0;

  if (!profile || profile.evidenceLevel === "uncalibrated") {
    reasons.push({
      code: "new_brand",
      message: "Brand has no seed calibration — human judgment will teach initial taste boundaries.",
    });
    score += 40;
  } else if (decisionCount < 10) {
    reasons.push({
      code: "low_sample",
      message: `Only ${decisionCount} calibration decision(s) — sample is thin.`,
    });
    score += 25;
  }

  if (input.priorDisagreementRate != null && input.priorDisagreementRate > 0.3) {
    reasons.push({
      code: "disagreement_history",
      message: "Prior system-human disagreement is elevated for this brand.",
    });
    score += 20;
  }

  const conflictingRules = input.approvedRules.filter(
    (rule) => rule.mismatchBucket === "acceptable_override"
  );
  if (conflictingRules.length > 1) {
    reasons.push({
      code: "rule_conflict",
      message: "Multiple override rules may conflict — human judgment needed.",
    });
    score += 15;
  }

  if (input.isHighImpactExport) {
    reasons.push({
      code: "high_impact_export",
      message: "High-impact export output — human review teaches export/Olhar boundary.",
    });
    score += 20;
  }

  if (
    input.systemOlharVerdict === "sem_opiniao" ||
    input.systemOlharVerdict === "confusa"
  ) {
    reasons.push({
      code: "low_confidence",
      message: "System Olhar verdict is low-confidence.",
    });
    score += 30;
  }

  const level: JudgmentUncertainty["level"] =
    score >= 50 ? "high" : score >= 25 ? "medium" : "low";

  const requiresHumanReview =
    level === "high" ||
    (!profile || profile.evidenceLevel === "uncalibrated") ||
    (input.systemOlharVerdict === "sem_opiniao");

  return {
    score: Math.min(score, 100),
    level,
    reasons,
    requiresHumanReview,
  };
}

export interface ReviewQueueItem {
  derivationId: string;
  campaignId: string;
  uncertainty: JudgmentUncertainty;
  teachableSummary: string;
}

export function buildReviewQueue(input: {
  items: Array<{
    derivationId: string;
    campaignId: string;
    uncertainty: JudgmentUncertainty;
  }>;
  maxItems?: number;
}): ReviewQueueItem[] {
  const max = Math.min(Math.max(input.maxItems ?? 15, 5), 15);

  return input.items
    .filter((item) => item.uncertainty.requiresHumanReview)
    .sort((a, b) => b.uncertainty.score - a.uncertainty.score)
    .slice(0, max)
    .map((item) => ({
      ...item,
      teachableSummary: item.uncertainty.reasons.map((r) => r.message).join(" "),
    }));
}

export function shouldSkipHumanReview(uncertainty: JudgmentUncertainty): boolean {
  return !uncertainty.requiresHumanReview && uncertainty.level === "low";
}
