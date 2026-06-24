import { aggregateGroup, buildCompositeSliceKey } from "../calibration/aggregate";
import { buildCalibrationComparisons } from "../calibration/compare";
import type { EvaluatedCorpusRow } from "../calibration/types";
import type { HumanQualityFailureReason, HumanQualitySourceLabel } from "../corpus";
import type { InsertClientLearningProposalInput } from "../../repositories/client-learning-proposal";
import { MIN_SLICE_SAMPLE } from "../sampling/thresholds";
import { buildDirectiveForFailureReason } from "./directives";

const DIVERGENCE_THRESHOLD = 15;

export interface LearningSliceMember {
  workspaceId: string;
  clientProfileId: string;
  intent: string;
  comparison: ReturnType<typeof buildCalibrationComparisons>[number];
  sourceLabel?: HumanQualitySourceLabel;
  feedbackArtifactId?: string;
}

export interface LearningSliceBucket {
  sliceKey: string;
  workspaceId: string;
  clientProfileId: string;
  primaryFailureReason: HumanQualityFailureReason;
  members: LearningSliceMember[];
  stats: ReturnType<typeof aggregateGroup>;
  rejectRegenerateCount: number;
  corpusItemIds: string[];
  artifactIds: string[];
  fixtureOnly: boolean;
}

function buildSliceKey(
  workspaceId: string,
  clientProfileId: string,
  comparison: LearningSliceMember["comparison"]
): string {
  const compositeKey = buildCompositeSliceKey(
    comparison.primaryFailureReason,
    comparison.generationMode,
    comparison.format
  );
  return `${workspaceId}:${clientProfileId}:${compositeKey}`;
}

export function buildLearningSliceBuckets(
  rows: EvaluatedCorpusRow[]
): LearningSliceBucket[] {
  const comparisons = buildCalibrationComparisons(rows);
  const members: LearningSliceMember[] = rows.map((row, index) => ({
    workspaceId: row.item.workspaceId,
    clientProfileId: row.item.clientProfileId,
    intent: row.evaluation.intent,
    comparison: comparisons[index],
    sourceLabel: row.sourceLabel,
    feedbackArtifactId: row.feedbackArtifactId,
  }));

  const buckets = new Map<string, LearningSliceMember[]>();

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

  const result: LearningSliceBucket[] = [];

  for (const [sliceKey, sliceMembers] of buckets) {
    const sliceComparisons = sliceMembers.map((member) => member.comparison);
    const stats = aggregateGroup(sliceComparisons);
    const rejectRegenerateCount = sliceMembers.filter(
      (member) => member.intent === "reject" || member.intent === "regenerate"
    ).length;

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

    result.push({
      sliceKey,
      workspaceId: sliceMembers[0].workspaceId,
      clientProfileId: sliceMembers[0].clientProfileId,
      primaryFailureReason: sliceComparisons[0].primaryFailureReason,
      members: sliceMembers,
      stats,
      rejectRegenerateCount,
      corpusItemIds,
      artifactIds,
      fixtureOnly,
    });
  }

  return result;
}

export function meetsLearningSliceThresholds(bucket: LearningSliceBucket): boolean {
  if (bucket.stats.count < MIN_SLICE_SAMPLE) {
    return false;
  }

  if (
    bucket.stats.meanSignedDelta === null ||
    Math.abs(bucket.stats.meanSignedDelta) < DIVERGENCE_THRESHOLD
  ) {
    return false;
  }

  if (bucket.rejectRegenerateCount < 2) {
    return false;
  }

  return true;
}

export function buildClientLearningProposals(
  rows: EvaluatedCorpusRow[]
): InsertClientLearningProposalInput[] {
  const proposals: InsertClientLearningProposalInput[] = [];

  for (const bucket of buildLearningSliceBuckets(rows)) {
    if (!meetsLearningSliceThresholds(bucket)) {
      continue;
    }

    if (bucket.primaryFailureReason === "factual_issue") {
      continue;
    }

    const rationale = buildDirectiveForFailureReason(bucket.primaryFailureReason);
    if (!rationale) {
      continue;
    }

    const evidenceRefs: InsertClientLearningProposalInput["evidenceRefs"] = {
      corpusItemIds: bucket.corpusItemIds,
      stats: {
        count: bucket.stats.count,
        meanSignedDelta: bucket.stats.meanSignedDelta,
        meanAbsError: bucket.stats.meanAbsError,
        overScoreCount: bucket.stats.overScoreCount,
        underScoreCount: bucket.stats.underScoreCount,
      },
    };

    if (bucket.artifactIds.length > 0) {
      evidenceRefs.artifactIds = bucket.artifactIds;
    }

    if (bucket.fixtureOnly) {
      evidenceRefs.fixtureOnly = true;
    }

    proposals.push({
      workspaceId: bucket.workspaceId,
      clientProfileId: bucket.clientProfileId,
      sliceKey: bucket.sliceKey,
      primaryFailureReason: bucket.primaryFailureReason,
      rationale,
      evidenceRefs,
    });
  }

  return proposals;
}
