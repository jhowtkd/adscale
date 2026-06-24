import { aggregateGroup, buildCompositeSliceKey } from "../calibration/aggregate";
import { buildCalibrationComparisons } from "../calibration/compare";
import type { EvaluatedCorpusRow } from "../calibration/types";
import type { HumanQualitySourceLabel } from "../corpus";
import type { InsertClientLearningProposalInput } from "../../repositories/client-learning-proposal";
import { MIN_SLICE_SAMPLE } from "../sampling/thresholds";
import { buildDirectiveForFailureReason } from "./directives";

const DIVERGENCE_THRESHOLD = 15;

interface SliceMember {
  workspaceId: string;
  clientProfileId: string;
  intent: string;
  comparison: ReturnType<typeof buildCalibrationComparisons>[number];
  sourceLabel?: HumanQualitySourceLabel;
  feedbackArtifactId?: string;
}

function buildSliceKey(
  workspaceId: string,
  clientProfileId: string,
  comparison: SliceMember["comparison"]
): string {
  const compositeKey = buildCompositeSliceKey(
    comparison.primaryFailureReason,
    comparison.generationMode,
    comparison.format
  );
  return `${workspaceId}:${clientProfileId}:${compositeKey}`;
}

export function buildClientLearningProposals(
  rows: EvaluatedCorpusRow[]
): InsertClientLearningProposalInput[] {
  const comparisons = buildCalibrationComparisons(rows);
  const members: SliceMember[] = rows.map((row, index) => ({
    workspaceId: row.item.workspaceId,
    clientProfileId: row.item.clientProfileId,
    intent: row.evaluation.intent,
    comparison: comparisons[index],
    sourceLabel: row.sourceLabel,
    feedbackArtifactId: row.feedbackArtifactId,
  }));

  const buckets = new Map<string, SliceMember[]>();

  for (const member of members) {
    const sliceKey = buildSliceKey(
      member.workspaceId,
      member.clientProfileId,
      member.comparison
    );
    const existing = buckets.get(sliceKey) ?? [];
    existing.push(member);
    buckets.set(sliceKey, existing);
  }

  const proposals: InsertClientLearningProposalInput[] = [];

  for (const [sliceKey, sliceMembers] of buckets) {
    const sliceComparisons = sliceMembers.map((member) => member.comparison);
    const stats = aggregateGroup(sliceComparisons);

    if (stats.count < MIN_SLICE_SAMPLE) {
      continue;
    }

    if (
      stats.meanSignedDelta === null ||
      Math.abs(stats.meanSignedDelta) < DIVERGENCE_THRESHOLD
    ) {
      continue;
    }

    const rejectRegenerateCount = sliceMembers.filter(
      (member) => member.intent === "reject" || member.intent === "regenerate"
    ).length;
    if (rejectRegenerateCount < 2) {
      continue;
    }

    const primaryFailureReason = sliceComparisons[0].primaryFailureReason;
    if (primaryFailureReason === "factual_issue") {
      continue;
    }

    const rationale = buildDirectiveForFailureReason(primaryFailureReason);
    if (!rationale) {
      continue;
    }

    const corpusItemIds = sliceComparisons
      .filter((comparison) => comparison.scoreDelta !== null)
      .map((comparison) => comparison.corpusItemId);

    const artifactIds = [
      ...new Set(
        sliceMembers
          .map((member) => member.feedbackArtifactId)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const fixtureOnly =
      sliceMembers.length > 0 &&
      sliceMembers.every((member) => member.sourceLabel === "synthetic_fixture");

    const evidenceRefs: InsertClientLearningProposalInput["evidenceRefs"] = {
      corpusItemIds,
      stats: {
        count: stats.count,
        meanSignedDelta: stats.meanSignedDelta,
        meanAbsError: stats.meanAbsError,
        overScoreCount: stats.overScoreCount,
        underScoreCount: stats.underScoreCount,
      },
    };

    if (artifactIds.length > 0) {
      evidenceRefs.artifactIds = artifactIds;
    }

    if (fixtureOnly) {
      evidenceRefs.fixtureOnly = true;
    }

    proposals.push({
      workspaceId: sliceMembers[0].workspaceId,
      clientProfileId: sliceMembers[0].clientProfileId,
      sliceKey,
      primaryFailureReason,
      rationale,
      evidenceRefs,
    });
  }

  return proposals;
}
