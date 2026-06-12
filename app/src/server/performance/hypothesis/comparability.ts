import type { CreativePerformanceSnapshot } from "../../db/schema";
import type { ComparisonExclusion } from "./types";

export interface ComparabilityInput {
  campaignId: string;
  campaignObjective: string | null;
  hypothesisPlatform: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  variants: Array<{ derivationId: string; campaignId: string }>;
  snapshotsByDerivation: Map<string, CreativePerformanceSnapshot[]>;
}

function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function snapshotInWindow(
  snap: CreativePerformanceSnapshot,
  windowStart: string | null,
  windowEnd: string | null
): boolean {
  if (!windowStart && !windowEnd) return true;
  const start = windowStart ?? snap.startDate;
  const end = windowEnd ?? snap.endDate;
  return periodsOverlap(snap.startDate, snap.endDate, start, end);
}

export function checkComparability(
  input: ComparabilityInput
): ComparisonExclusion[] {
  const exclusions: ComparisonExclusion[] = [];

  if (input.variants.length < 2) {
    exclusions.push({
      code: "single_variant",
      message: "At least two variants are required for comparison.",
    });
    return exclusions;
  }

  if (!input.campaignObjective?.trim()) {
    exclusions.push({
      code: "missing_objective",
      message:
        "Campaign objective is required as minimum context for comparable variants.",
    });
  }

  for (const variant of input.variants) {
    if (variant.campaignId !== input.campaignId) {
      exclusions.push({
        code: "derivation_campaign_mismatch",
        message: "All derivations must belong to the same campaign.",
        details: { derivationId: variant.derivationId },
      });
    }
  }

  const derivationPlatforms = new Map<string, Set<string>>();
  const derivationPeriods = new Map<
    string,
    { startDate: string; endDate: string } | null
  >();

  for (const variant of input.variants) {
    const snaps = (input.snapshotsByDerivation.get(variant.derivationId) ?? [])
      .filter((s) => snapshotInWindow(s, input.periodStart, input.periodEnd))
      .filter(
        (s) =>
          !input.hypothesisPlatform || s.platform === input.hypothesisPlatform
      );

    if (snaps.length === 0) {
      exclusions.push({
        code: "missing_snapshots",
        message: "No performance snapshots found for a variant in the comparison window.",
        details: { derivationId: variant.derivationId },
      });
      continue;
    }

    derivationPlatforms.set(
      variant.derivationId,
      new Set(snaps.map((s) => s.platform))
    );

    let start = snaps[0]!.startDate;
    let end = snaps[0]!.endDate;
    for (const s of snaps) {
      start = start < s.startDate ? start : s.startDate;
      end = end > s.endDate ? end : s.endDate;
    }
    derivationPeriods.set(variant.derivationId, { startDate: start, endDate: end });
  }

  const platformSets = [...derivationPlatforms.values()];
  if (platformSets.length >= 2) {
    const allPlatforms = new Set(platformSets.flatMap((s) => [...s]));
    if (allPlatforms.size > 1) {
      exclusions.push({
        code: "platform_mismatch",
        message:
          "Variants must be compared on the same platform; mixed platforms were detected.",
        details: { platforms: [...allPlatforms].join(", ") },
      });
    }
  }

  const periods = [...derivationPeriods.values()].filter(Boolean) as Array<{
    startDate: string;
    endDate: string;
  }>;

  if (periods.length >= 2) {
    let overlapStart = periods[0]!.startDate;
    let overlapEnd = periods[0]!.endDate;
    for (let i = 1; i < periods.length; i += 1) {
      const p = periods[i]!;
      overlapStart = overlapStart > p.startDate ? overlapStart : p.startDate;
      overlapEnd = overlapEnd < p.endDate ? overlapEnd : p.endDate;
    }
    if (overlapStart > overlapEnd) {
      exclusions.push({
        code: "period_no_overlap",
        message:
          "Variant performance periods do not overlap; comparison is not valid.",
      });
    }
  }

  return exclusions;
}

export function filterComparableSnapshots(
  snapshots: CreativePerformanceSnapshot[],
  platform: string | null,
  periodStart: string | null,
  periodEnd: string | null
): CreativePerformanceSnapshot[] {
  return snapshots.filter(
    (s) =>
      (!platform || s.platform === platform) &&
      snapshotInWindow(s, periodStart, periodEnd)
  );
}
