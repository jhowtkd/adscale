import { buildCompositeSliceKey } from "../calibration/aggregate";
import { buildCalibrationComparisons } from "../calibration/compare";
import type { EvaluatedCorpusRow } from "../calibration/types";
import { buildClientLearningProposals, buildLearningSliceBuckets, corpusPieceKey } from "./aggregate";
import type { ClientLearningProposal } from "@/server/db/schema";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";
import {
  findActiveProposalBySlice,
  listRejectedProposalsBySlice,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { listCorpusItemsByIds, listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { listFeedbackArtifactIdsByCorpusItemIds } from "@/server/repositories/human-quality-feedback-artifact";
import { MIN_SLICE_SAMPLE } from "../sampling/thresholds";

export interface GenerateAndPersistClientLearningProposalsOptions {
  workspaceId?: string;
  cohort?: string;
}

function buildSliceKeyForRow(row: EvaluatedCorpusRow): string {
  const [comparison] = buildCalibrationComparisons([row]);
  const compositeKey = buildCompositeSliceKey(
    comparison.primaryFailureReason,
    comparison.generationMode,
    comparison.format
  );
  return `${row.item.workspaceId}:${row.item.clientProfileId}:${compositeKey}`;
}

function countPostApprovalEvalsForSlice(
  rows: EvaluatedCorpusRow[],
  sliceKey: string,
  approvedAt: Date
): number {
  return new Set(rows.filter((row) => {
    if (buildSliceKeyForRow(row) !== sliceKey) {
      return false;
    }
    return row.evaluation.createdAt > approvedAt;
  }).map(row => corpusPieceKey(row.item))).size;
}

async function enrichRowsWithFeedbackArtifacts(
  rows: EvaluatedCorpusRow[]
): Promise<EvaluatedCorpusRow[]> {
  const artifactIdsByCorpusItemId = await listFeedbackArtifactIdsByCorpusItemIds(
    rows.map((row) => row.item.id)
  );

  return rows.map((row) => ({
    ...row,
    feedbackArtifactId: artifactIdsByCorpusItemId.get(row.item.id),
  }));
}

export async function generateAndPersistClientLearningProposals(
  options: GenerateAndPersistClientLearningProposalsOptions = {}
): Promise<{ generated: number; proposals: ClientLearningProposal[] }> {
  const rows = await enrichRowsWithFeedbackArtifacts(
    await listEvaluatedCorpusWithEvaluations({
      workspaceId: options.workspaceId,
      cohort: options.cohort,
    })
  );

  const built = buildLearningSliceBuckets(rows);
  const proposals: ClientLearningProposal[] = [];

  for (const bucket of built) {
    const existing = await findActiveProposalBySlice(
      bucket.workspaceId,
      bucket.clientProfileId,
      bucket.sliceKey
    );
    if (existing) {
      continue;
    }

    const rejected = await listRejectedProposalsBySlice(
      bucket.workspaceId,
      bucket.clientProfileId,
      bucket.sliceKey
    );
    let eligibleRows = rows.filter(row => buildSliceKeyForRow(row) === bucket.sliceKey);
    const latestRejected = rejected[0];
    if (latestRejected) {
      if (!latestRejected.cooldownUntil || latestRejected.cooldownUntil > new Date()) continue;
      // Legacy rejections have no decision date; their persisted 30-day deadline is the boundary.
      const rejectedAt = latestRejected.rejectedAt ?? new Date(latestRejected.cooldownUntil.getTime() - 30 * 86_400_000);
      const previousIds = new Set(rejected.flatMap(proposal => proposal.evidenceRefs.corpusItemIds));
      const previousItems = await listCorpusItemsByIds(bucket, [...previousIds]);
      if (previousItems.length !== previousIds.size) continue;
      const previousPieces = new Set(previousItems.map(corpusPieceKey));
      eligibleRows = eligibleRows.filter(row =>
        row.evaluation.createdAt > rejectedAt && !previousPieces.has(corpusPieceKey(row.item))
      );
    }
    const [proposal] = buildClientLearningProposals(eligibleRows);
    if (!proposal) continue;

    const approvedRule = await getApprovedCorpusQualityRuleForFailure({
      workspaceId: proposal.workspaceId,
      clientProfileId: proposal.clientProfileId,
      primaryFailureReason: proposal.primaryFailureReason,
    });

    if (approvedRule?.approvedAt) {
      const postApprovalCount = countPostApprovalEvalsForSlice(
        rows,
        proposal.sliceKey,
        approvedRule.approvedAt
      );
      if (postApprovalCount < MIN_SLICE_SAMPLE) {
        continue;
      }
    }

    proposals.push(await insertClientLearningProposal(proposal));
  }

  return { generated: proposals.length, proposals };
}
