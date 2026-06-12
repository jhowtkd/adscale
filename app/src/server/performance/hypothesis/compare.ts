import type { CreativePerformanceSnapshot } from "../../db/schema";
import { derivePerformanceMetrics } from "../metrics";
import {
  aggregateSnapshots,
  getPrimaryMetricValue,
  type AggregatedSnapshotMetrics,
} from "./aggregate";
import { checkComparability, filterComparableSnapshots } from "./comparability";
import type {
  ComparisonVerdict,
  HypothesisExpectedDirection,
  HypothesisKind,
  HypothesisOutcome,
  HypothesisPrimaryMetric,
  HypothesisVariantRole,
  VariantComparisonReport,
} from "./types";
import {
  LOWER_IS_BETTER_METRICS,
  MIN_IMPRESSIONS_FOR_EVIDENCE,
  WINNER_RELATIVE_GAP,
} from "./types";

export interface CompareVariantsInput {
  kind: HypothesisKind;
  campaignId: string;
  campaignObjective: string | null;
  platform: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  primaryMetric: HypothesisPrimaryMetric;
  expectedDirection: HypothesisExpectedDirection | null;
  variants: Array<{
    derivationId: string;
    campaignId: string;
    role: HypothesisVariantRole | "observational";
    label?: string | null;
  }>;
  snapshotsByDerivation: Map<string, CreativePerformanceSnapshot[]>;
}

function parseMetric(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isBetter(
  candidate: number,
  reference: number,
  metric: HypothesisPrimaryMetric
): boolean {
  if (LOWER_IS_BETTER_METRICS.has(metric)) {
    return candidate < reference;
  }
  return candidate > reference;
}

function relativeDelta(candidate: number, reference: number): number | null {
  if (reference === 0) return null;
  return (candidate - reference) / Math.abs(reference);
}

function mapOutcome(
  verdict: ComparisonVerdict,
  expectedDirection: HypothesisExpectedDirection | null,
  winnerBetterThanControl: boolean | null
): HypothesisOutcome | null {
  if (verdict !== "winner" || expectedDirection === null || winnerBetterThanControl === null) {
    return "inconclusive";
  }
  const expectedIncrease = expectedDirection === "increase";
  if (winnerBetterThanControl === expectedIncrease) {
    return "supported";
  }
  return "contradicted";
}

function buildVariantBundle(
  derivationId: string,
  role: HypothesisVariantRole | "observational",
  label: string | null | undefined,
  aggregated: AggregatedSnapshotMetrics,
  primaryMetric: HypothesisPrimaryMetric
): VariantComparisonReport["variants"][number] {
  const derived = derivePerformanceMetrics({
    impressions: aggregated.impressions,
    clicks: aggregated.clicks,
    spend: aggregated.spend,
    conversions: aggregated.conversions,
    conversionValue: aggregated.conversionValue,
  });

  return {
    derivationId,
    role,
    label: label ?? null,
    raw: {
      impressions: aggregated.impressions,
      clicks: aggregated.clicks,
      spend: aggregated.spend,
      conversions: aggregated.conversions,
      conversionValue: aggregated.conversionValue,
    },
    derived,
    sampleSize: {
      impressions: aggregated.impressions,
      clicks: aggregated.clicks,
    },
    period: aggregated.period,
    primaryMetricValue: getPrimaryMetricValue(primaryMetric, aggregated),
  };
}

export function compareVariants(input: CompareVariantsInput): VariantComparisonReport {
  const exclusions = checkComparability({
    campaignId: input.campaignId,
    campaignObjective: input.campaignObjective,
    hypothesisPlatform: input.platform,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    variants: input.variants.map((v) => ({
      derivationId: v.derivationId,
      campaignId: v.campaignId,
    })),
    snapshotsByDerivation: input.snapshotsByDerivation,
  });

  const baseReport: VariantComparisonReport = {
    kind: input.kind,
    verdict: "not_comparable",
    primaryMetric: input.primaryMetric,
    expectedDirection: input.expectedDirection,
    winnerDerivationId: null,
    outcome: null,
    platform: input.platform,
    objective: input.campaignObjective,
    period:
      input.periodStart && input.periodEnd
        ? { startDate: input.periodStart, endDate: input.periodEnd }
        : null,
    exclusions,
    variants: [],
    differences: [],
  };

  if (exclusions.length > 0) {
    return {
      ...baseReport,
      outcome: input.kind === "controlled_hypothesis" ? "inconclusive" : null,
    };
  }

  const variantBundles = input.variants.map((v) => {
    const filtered = filterComparableSnapshots(
      input.snapshotsByDerivation.get(v.derivationId) ?? [],
      input.platform,
      input.periodStart,
      input.periodEnd
    );
    const aggregated = aggregateSnapshots(filtered);
    return buildVariantBundle(
      v.derivationId,
      v.role,
      v.label,
      aggregated,
      input.primaryMetric
    );
  });

  const totalImpressions = variantBundles.reduce(
    (sum, v) => sum + Number(v.raw.impressions),
    0
  );

  const hasNullPrimary = variantBundles.some(
    (v) => v.primaryMetricValue === null
  );

  if (totalImpressions < MIN_IMPRESSIONS_FOR_EVIDENCE || hasNullPrimary) {
    return {
      ...baseReport,
      variants: variantBundles,
      verdict: "insufficient_evidence",
      outcome: input.kind === "controlled_hypothesis" ? "inconclusive" : null,
    };
  }

  const control =
    variantBundles.find((v) => v.role === "control") ?? variantBundles[0]!;
  const controlValue = parseMetric(control.primaryMetricValue);

  const differences = variantBundles.map((v) => {
    const value = parseMetric(v.primaryMetricValue);
    if (value === null || controlValue === null || v.derivationId === control.derivationId) {
      return {
        derivationId: v.derivationId,
        vsControl: null,
        relativeDelta: null,
      };
    }
    const delta = value - controlValue;
    const rel = relativeDelta(value, controlValue);
    return {
      derivationId: v.derivationId,
      vsControl: delta.toFixed(6),
      relativeDelta: rel !== null ? rel.toFixed(6) : null,
    };
  });

  const ranked = variantBundles
    .map((v) => ({
      derivationId: v.derivationId,
      value: parseMetric(v.primaryMetricValue),
    }))
    .filter((v): v is { derivationId: string; value: number } => v.value !== null)
    .sort((a, b) => {
      if (LOWER_IS_BETTER_METRICS.has(input.primaryMetric)) {
        return a.value - b.value;
      }
      return b.value - a.value;
    });

  if (ranked.length < 2) {
    return {
      ...baseReport,
      variants: variantBundles,
      differences,
      verdict: "insufficient_evidence",
      outcome: input.kind === "controlled_hypothesis" ? "inconclusive" : null,
    };
  }

  const best = ranked[0]!;
  const second = ranked[1]!;
  const gap = relativeDelta(best.value, second.value);

  let verdict: ComparisonVerdict = "no_clear_winner";
  let winnerDerivationId: string | null = null;

  if (gap !== null && Math.abs(gap) >= WINNER_RELATIVE_GAP) {
    verdict = "winner";
    winnerDerivationId = best.derivationId;
  }

  let winnerBetterThanControl: boolean | null = null;
  if (verdict === "winner" && controlValue !== null && winnerDerivationId) {
    const winnerValue = ranked.find((r) => r.derivationId === winnerDerivationId)?.value;
    if (winnerValue !== undefined) {
      winnerBetterThanControl = isBetter(winnerValue, controlValue, input.primaryMetric);
    }
  }

  const effectivePeriod = variantBundles.reduce<{ startDate: string; endDate: string } | null>(
    (acc, v) => {
      if (!v.period) return acc;
      if (!acc) return { ...v.period };
      return {
        startDate: acc.startDate < v.period.startDate ? acc.startDate : v.period.startDate,
        endDate: acc.endDate > v.period.endDate ? acc.endDate : v.period.endDate,
      };
    },
    null
  );

  const platformSet = new Set<string>();
  for (const v of input.variants) {
    const snaps = filterComparableSnapshots(
      input.snapshotsByDerivation.get(v.derivationId) ?? [],
      input.platform,
      input.periodStart,
      input.periodEnd
    );
    for (const s of snaps) platformSet.add(s.platform);
  }

  return {
    kind: input.kind,
    verdict,
    primaryMetric: input.primaryMetric,
    expectedDirection: input.expectedDirection,
    winnerDerivationId,
    outcome:
      input.kind === "controlled_hypothesis"
        ? mapOutcome(verdict, input.expectedDirection, winnerBetterThanControl)
        : null,
    platform: input.platform ?? [...platformSet][0] ?? null,
    objective: input.campaignObjective,
    period: effectivePeriod,
    exclusions: [],
    variants: variantBundles,
    differences,
  };
}
