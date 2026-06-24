import { aggregateGroup } from "../calibration/aggregate";
import { proposeAdjustments } from "../calibration/adjustments";
import { buildCalibrationComparisons } from "../calibration/compare";
import {
  persistProposedAdjustments,
  type ProposedAdjustment,
} from "../calibration/service";
import { listApprovedCorpusQualityRules } from "@/server/repositories/calibration-rule";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import type { CalibrationRule } from "@/server/db/schema";

const MIN_DISTINCT_CLIENTS = 2;
const CROSS_CLIENT_MIN_EVALUATIONS = 6;
const CROSS_CLIENT_DIVERGENCE_THRESHOLD = 15;

export function extractPrimaryFailureReasonFromRationale(
  rationale: string
): string | null {
  const separatorIndex = rationale.indexOf(": ");
  if (separatorIndex <= 0) {
    return null;
  }

  return rationale.slice(0, separatorIndex);
}

function groupApprovedRulesByFailureReason(
  rules: CalibrationRule[]
): Map<string, CalibrationRule[]> {
  const byFailure = new Map<string, CalibrationRule[]>();

  for (const rule of rules) {
    const failureReason = extractPrimaryFailureReasonFromRationale(rule.rationale);
    if (!failureReason) {
      continue;
    }

    const existing = byFailure.get(failureReason) ?? [];
    existing.push(rule);
    byFailure.set(failureReason, existing);
  }

  return byFailure;
}

export async function detectAndPersistCrossClientGlobalProposals(): Promise<
  ProposedAdjustment[]
> {
  const approvedRules = await listApprovedCorpusQualityRules();
  const byFailure = groupApprovedRulesByFailureReason(approvedRules);
  const persistedAdjustments: ProposedAdjustment[] = [];

  for (const [failureReason, rules] of byFailure) {
    const distinctClients = new Set(rules.map((rule) => rule.clientProfileId));
    if (distinctClients.size < MIN_DISTINCT_CLIENTS) {
      continue;
    }

    const clientProfileIds = new Set(distinctClients);
    const rows = await listEvaluatedCorpusWithEvaluations({
      primaryFailureReason: failureReason,
    });
    const filteredRows = rows.filter((row) =>
      clientProfileIds.has(row.item.clientProfileId)
    );

    const comparisons = buildCalibrationComparisons(filteredRows);
    const stats = aggregateGroup(comparisons);

    if (stats.count < CROSS_CLIENT_MIN_EVALUATIONS) {
      continue;
    }

    if (
      stats.meanSignedDelta === null ||
      Math.abs(stats.meanSignedDelta) < CROSS_CLIENT_DIVERGENCE_THRESHOLD
    ) {
      continue;
    }

    const proposals = proposeAdjustments(comparisons);
    const fixtureOnly =
      filteredRows.length > 0 &&
      filteredRows.every((row) => row.sourceLabel === "synthetic_fixture");
    const supportingClientRuleIds = rules.map((rule) => rule.id);
    const enrichedProposals = proposals.map((proposal) => ({
      ...proposal,
      evidenceRefs: {
        ...proposal.evidenceRefs,
        fixtureOnly,
        supportingClientRuleIds,
        primaryFailureReason: failureReason,
        promotionSource: "cross_client" as const,
      },
    }));
    const persisted = await persistProposedAdjustments(enrichedProposals);
    persistedAdjustments.push(...persisted);
  }

  return persistedAdjustments;
}
