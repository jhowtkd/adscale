import type { CreativeHardFailure, CreativeHardFailureCode } from "./creative-quality-gate";

export const SCORE_CEILING_BY_FAILURE: Partial<Record<CreativeHardFailureCode, number>> = {
  invented_factual_entity: 20,
  unsupported_offer: 20,
  campaign_identity_drift: 15,
  replaced_source_subject: 15,
  wrong_brand: 15,
  unauthorized_brand_or_ip: 15,
  cta_drift: 50,
  // 132-adjustment:634f9104-c080-4dda-82c1-4b1298b6a072
  visual_overload: 50,
  missing_dominant_idea: 55,
  generic_template_aesthetic: 55,
  decorative_only_variation: 60,
  style_reference_contamination: 20,
};

const DEFAULT_FAILURE_CEILING = 60;

const FAILURE_BREAKDOWN_CLAMP: Partial<
  Record<CreativeHardFailureCode, Array<keyof ScoreCeilingBreakdown>>
> = {
  invented_factual_entity: ["briefMatch", "informationPreservation"],
  unsupported_offer: ["briefMatch", "informationPreservation"],
  campaign_identity_drift: ["briefMatch", "formatFit", "informationPreservation"],
  replaced_source_subject: ["briefMatch", "informationPreservation"],
  wrong_brand: ["briefMatch"],
  unauthorized_brand_or_ip: ["briefMatch"],
  cta_drift: ["ctaClarity"],
  visual_overload: ["visualQuality"],
  missing_dominant_idea: ["visualQuality"],
  generic_template_aesthetic: ["visualQuality"],
  decorative_only_variation: ["variationLevelFit"],
  style_reference_contamination: ["briefMatch", "informationPreservation"],
};

export interface ScoreCeilingBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
  variationLevelFit: number;
  informationPreservation: number;
}

export interface ScoreCeilingInput {
  qualityScore: number;
  scoreBreakdown?: ScoreCeilingBreakdown | null;
}

export interface ScoreCeilingResult {
  qualityScore: number;
  scoreBreakdown: ScoreCeilingBreakdown;
}

function emptyBreakdown(): ScoreCeilingBreakdown {
  return {
    ctaClarity: 0,
    textLegibility: 0,
    briefMatch: 0,
    visualQuality: 0,
    formatFit: 0,
    variationLevelFit: 0,
    informationPreservation: 0,
  };
}

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

function resolveCeiling(hardFailures: CreativeHardFailure[]): number {
  if (hardFailures.length === 0) {
    return 100;
  }
  const ceilings = hardFailures.map(
    (failure) => SCORE_CEILING_BY_FAILURE[failure.code] ?? DEFAULT_FAILURE_CEILING
  );
  return Math.min(DEFAULT_FAILURE_CEILING, ...ceilings);
}

function clampBreakdownDimensions(
  breakdown: ScoreCeilingBreakdown,
  hardFailures: CreativeHardFailure[],
  ceiling: number
): ScoreCeilingBreakdown {
  const keysToClamp = new Set<keyof ScoreCeilingBreakdown>();
  for (const failure of hardFailures) {
    const mapped = FAILURE_BREAKDOWN_CLAMP[failure.code];
    if (mapped) {
      for (const key of mapped) {
        keysToClamp.add(key);
      }
    }
  }

  const next = { ...breakdown };
  for (const key of keysToClamp) {
    next[key] = Math.min(next[key], ceiling);
  }
  return next;
}

export function applyScoreCeilings(
  score: ScoreCeilingInput,
  hardFailures: CreativeHardFailure[]
): ScoreCeilingResult {
  if (hardFailures.length === 0) {
    return {
      qualityScore: score.qualityScore,
      scoreBreakdown: score.scoreBreakdown ?? emptyBreakdown(),
    };
  }

  const ceiling = resolveCeiling(hardFailures);
  const baseBreakdown = score.scoreBreakdown ?? emptyBreakdown();
  const scoreBreakdown = clampBreakdownDimensions(baseBreakdown, hardFailures, ceiling);

  return {
    qualityScore: Math.min(score.qualityScore, ceiling),
    scoreBreakdown,
  };
}
