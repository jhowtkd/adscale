import type { PreflightResult, CampaignBrief } from "./preflight-analysis";

export type ReadinessDimensionId =
  | "offerClarity"
  | "textLegibility"
  | "visualHierarchy"
  | "ctaProminence"
  | "brandFit"
  | "platformFit";

export type ReadinessStatus = "ready" | "needs_attention" | "blocked";

export type PreflightAnalysisStatus = "pending" | "analyzing" | "completed" | "failed";

export interface ReadinessDimension {
  id: ReadinessDimensionId;
  score: number;
  suggestion: string;
}

export interface CreativeReadinessResult {
  overallScore: number;
  status: ReadinessStatus;
  dimensions: ReadinessDimension[];
  blockingIssues: string[];
  suggestions: string[];
  canGenerate: boolean;
  source: {
    campaignId: string;
    assetId: string;
    analyzedAt?: string;
    preflightStatus: PreflightAnalysisStatus;
  };
}

export interface BuildCreativeReadinessInput {
  preflight: PreflightResult;
  campaignId: string;
  assetId: string;
  analyzedAt?: string;
  preflightStatus?: PreflightAnalysisStatus;
  campaignBrief?: CampaignBrief;
}

export const READINESS_BLOCKING_SCORE_THRESHOLD = 50;
export const READINESS_READY_SCORE_THRESHOLD = 70;

/** Dimensions that warn but do not hard-block derivation (Phase 94 / READY-10). */
export const READINESS_WARNING_ONLY_DIMENSIONS: ReadonlySet<ReadinessDimensionId> =
  new Set(["ctaProminence"]);

const BLOCKING_SCORE_THRESHOLD = READINESS_BLOCKING_SCORE_THRESHOLD;
const READY_SCORE_THRESHOLD = READINESS_READY_SCORE_THRESHOLD;

function deriveOfferClarityScore(
  preflight: PreflightResult,
  campaignBrief?: CampaignBrief
): { score: number; suggestion: string } {
  const hierarchy = preflight.breakdown.visualHierarchy;
  const hasBriefOffer =
    Boolean(campaignBrief?.offer?.trim()) || Boolean(campaignBrief?.product?.trim());

  if (!hasBriefOffer) {
    return {
      score: Math.min(hierarchy.score, 40),
      suggestion:
        hierarchy.suggestion ||
        "Add product or offer details to the campaign brief before generating.",
    };
  }

  return {
    score: hierarchy.score,
    suggestion: hierarchy.suggestion,
  };
}

function resolveStatus(
  overallScore: number,
  blockingIssues: string[]
): ReadinessStatus {
  if (blockingIssues.length > 0 || overallScore < BLOCKING_SCORE_THRESHOLD) {
    return "blocked";
  }
  if (overallScore < READY_SCORE_THRESHOLD) {
    return "needs_attention";
  }
  return "ready";
}

function dimensionIsBlocking(
  dimensionId: ReadinessDimensionId,
  score: number
): boolean {
  if (READINESS_WARNING_ONLY_DIMENSIONS.has(dimensionId)) {
    return false;
  }
  return score < BLOCKING_SCORE_THRESHOLD;
}

/** Comma-separated dimension ids below blocking threshold — for beta analytics override events. */
export function formatBlockingDimensionIds(
  readiness: CreativeReadinessResult
): string {
  return readiness.dimensions
    .filter((dimension) => dimensionIsBlocking(dimension.id, dimension.score))
    .map((dimension) => dimension.id)
    .join(",");
}

/**
 * Converts raw preflight analysis into a stable UI-facing readiness contract.
 * Does not validate post-generation information preservation.
 */
export function buildCreativeReadiness(
  input: BuildCreativeReadinessInput
): CreativeReadinessResult {
  const {
    preflight,
    campaignId,
    assetId,
    analyzedAt,
    preflightStatus = "completed",
    campaignBrief,
  } = input;

  const offerClarity = deriveOfferClarityScore(preflight, campaignBrief);

  const dimensions: ReadinessDimension[] = [
    {
      id: "offerClarity",
      score: offerClarity.score,
      suggestion: offerClarity.suggestion,
    },
    {
      id: "textLegibility",
      score: preflight.breakdown.textLegibility.score,
      suggestion: preflight.breakdown.textLegibility.suggestion,
    },
    {
      id: "visualHierarchy",
      score: preflight.breakdown.visualHierarchy.score,
      suggestion: preflight.breakdown.visualHierarchy.suggestion,
    },
    {
      id: "ctaProminence",
      score: preflight.breakdown.ctaProminence.score,
      suggestion: preflight.breakdown.ctaProminence.suggestion,
    },
    {
      id: "brandFit",
      score: preflight.breakdown.brandConsistency.score,
      suggestion: preflight.breakdown.brandConsistency.suggestion,
    },
    {
      id: "platformFit",
      score: preflight.breakdown.platformReadiness.score,
      suggestion: preflight.breakdown.platformReadiness.suggestion,
    },
  ];

  const blockingIssues: string[] = [...preflight.criticalIssues];

  if (!campaignBrief?.offer?.trim() && !campaignBrief?.product?.trim()) {
    blockingIssues.push(
      "Campaign brief is missing product or offer context required for generation."
    );
  }

  for (const dimension of dimensions) {
    if (dimensionIsBlocking(dimension.id, dimension.score) && dimension.suggestion) {
      blockingIssues.push(dimension.suggestion);
    }
  }

  const uniqueBlocking = [...new Set(blockingIssues)];

  const suggestions: string[] = preflight.suggestions.filter(
    (suggestion) => !uniqueBlocking.includes(suggestion)
  );

  for (const dimension of dimensions) {
    const isWarningOnly = READINESS_WARNING_ONLY_DIMENSIONS.has(dimension.id);
    if (
      (!dimensionIsBlocking(dimension.id, dimension.score) ||
        isWarningOnly) &&
      dimension.score < READY_SCORE_THRESHOLD &&
      dimension.suggestion &&
      !suggestions.includes(dimension.suggestion) &&
      !uniqueBlocking.includes(dimension.suggestion)
    ) {
      suggestions.push(dimension.suggestion);
    }
  }

  const overallScore = preflight.overallScore;
  const status = resolveStatus(overallScore, uniqueBlocking);

  return {
    overallScore,
    status,
    dimensions,
    blockingIssues: uniqueBlocking,
    suggestions,
    canGenerate: status !== "blocked",
    source: {
      campaignId,
      assetId,
      analyzedAt,
      preflightStatus,
    },
  };
}
