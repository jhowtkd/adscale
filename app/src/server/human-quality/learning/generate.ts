import { buildCompositeSliceKey } from "../calibration/aggregate";
import { buildCalibrationComparisons } from "../calibration/compare";
import type { EvaluatedCorpusRow } from "../calibration/types";
import { buildClientLearningProposals } from "./aggregate";
import type { ClientLearningProposal } from "@/server/db/schema";
import { getApprovedCorpusQualityRuleForFailure } from "@/server/repositories/calibration-rule";
import {
  findActiveProposalBySlice,
  findSliceInCooldown,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
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
  return rows.filter((row) => {
    if (buildSliceKeyForRow(row) !== sliceKey) {
      return false;
    }
    return row.evaluation.createdAt > approvedAt;
  }).length;
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

  const built = buildClientLearningProposals(rows);
  const proposals: ClientLearningProposal[] = [];

  for (const proposal of built) {
    const existing = await findActiveProposalBySlice(
      proposal.workspaceId,
      proposal.clientProfileId,
      proposal.sliceKey
    );
    if (existing) {
      continue;
    }

    const inCooldown = await findSliceInCooldown(
      proposal.workspaceId,
      proposal.clientProfileId,
      proposal.sliceKey
    );
    if (inCooldown) {
      continue;
    }

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
