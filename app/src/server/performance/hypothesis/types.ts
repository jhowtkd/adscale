export const HYPOTHESIS_PRIMARY_METRICS = [
  "ctr",
  "cpc",
  "cpa",
  "roas",
  "conversions",
  "clicks",
  "impressions",
  "spend",
  "conversion_value",
] as const;

export type HypothesisPrimaryMetric = (typeof HYPOTHESIS_PRIMARY_METRICS)[number];

export const HYPOTHESIS_EXPECTED_DIRECTIONS = ["increase", "decrease"] as const;
export type HypothesisExpectedDirection =
  (typeof HYPOTHESIS_EXPECTED_DIRECTIONS)[number];

export const HYPOTHESIS_KINDS = ["controlled_hypothesis", "observational"] as const;
export type HypothesisKind = (typeof HYPOTHESIS_KINDS)[number];

export const HYPOTHESIS_VARIANT_ROLES = ["control", "variant"] as const;
export type HypothesisVariantRole = (typeof HYPOTHESIS_VARIANT_ROLES)[number];

export const COMPARISON_VERDICTS = [
  "winner",
  "no_clear_winner",
  "insufficient_evidence",
  "not_comparable",
] as const;

export type ComparisonVerdict = (typeof COMPARISON_VERDICTS)[number];

export const HYPOTHESIS_OUTCOMES = [
  "supported",
  "contradicted",
  "inconclusive",
] as const;

export type HypothesisOutcome = (typeof HYPOTHESIS_OUTCOMES)[number];

export const COMPARISON_EXCLUSION_CODES = [
  "derivation_campaign_mismatch",
  "platform_mismatch",
  "period_no_overlap",
  "missing_objective",
  "missing_variants",
  "missing_snapshots",
  "single_variant",
] as const;

export type ComparisonExclusionCode = (typeof COMPARISON_EXCLUSION_CODES)[number];

export interface ComparisonExclusion {
  code: ComparisonExclusionCode;
  message: string;
  details?: Record<string, string>;
}

export interface VariantMetricBundle {
  derivationId: string;
  role: HypothesisVariantRole | "observational";
  label?: string | null;
  raw: {
    impressions: string;
    clicks: string;
    spend: string;
    conversions: string;
    conversionValue: string;
  };
  derived: {
    ctr: string | null;
    cpc: string | null;
    cpa: string | null;
    roas: string | null;
  };
  sampleSize: {
    impressions: string;
    clicks: string;
  };
  period: {
    startDate: string;
    endDate: string;
  } | null;
  primaryMetricValue: string | null;
}

export interface VariantComparisonReport {
  kind: HypothesisKind;
  verdict: ComparisonVerdict;
  primaryMetric: HypothesisPrimaryMetric;
  expectedDirection: HypothesisExpectedDirection | null;
  winnerDerivationId: string | null;
  outcome: HypothesisOutcome | null;
  platform: string | null;
  objective: string | null;
  period: { startDate: string; endDate: string } | null;
  exclusions: ComparisonExclusion[];
  variants: VariantMetricBundle[];
  differences: Array<{
    derivationId: string;
    vsControl: string | null;
    relativeDelta: string | null;
  }>;
}

/** Minimum impressions for a comparison to claim sufficient evidence. */
export const MIN_IMPRESSIONS_FOR_EVIDENCE = 1000;

/** Relative gap required to declare a winner (fraction, e.g. 0.05 = 5%). */
export const WINNER_RELATIVE_GAP = 0.05;

export const LOWER_IS_BETTER_METRICS: ReadonlySet<HypothesisPrimaryMetric> = new Set([
  "cpc",
  "cpa",
  "spend",
]);
