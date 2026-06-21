import {
  getCorpusCandidateById,
  markCorpusCandidatePromoted,
} from "@/server/repositories/human-quality-candidate";
import {
  findCorpusItemByDerivationVersion,
  getCorpusItemByIdAnyWorkspace,
  insertCorpusItem,
} from "@/server/repositories/human-quality-corpus";
import type { HumanQualityCorpusCandidate, HumanQualityCorpusItem } from "@/server/db/schema";
import { classifyCohort, isHumanQualityCorpusCohort } from "./corpus";

export class CorpusCandidatePromotionError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "CorpusCandidatePromotionError";
  }
}

export interface PromoteCorpusCandidateInput {
  candidateId: string;
  cohort: string;
  selectedByUserId: string;
}

export interface PromoteCorpusCandidateResult {
  candidate: HumanQualityCorpusCandidate;
  item: HumanQualityCorpusItem;
  created: boolean;
}

export async function promoteCorpusCandidateToQueue(
  input: PromoteCorpusCandidateInput
): Promise<PromoteCorpusCandidateResult> {
  if (!isHumanQualityCorpusCohort(input.cohort)) {
    throw new CorpusCandidatePromotionError("cohort is invalid", "validation_error");
  }

  const candidate = await getCorpusCandidateById(input.candidateId);
  if (!candidate) {
    throw new CorpusCandidatePromotionError("Candidate not found", "candidate_not_found");
  }

  if (candidate.promotedCorpusItemId) {
    const existingItem = await getCorpusItemByIdAnyWorkspace(candidate.promotedCorpusItemId);
    if (existingItem) {
      return { candidate, item: existingItem, created: false };
    }
  }

  const existingItem = await findCorpusItemByDerivationVersion(
    candidate.workspaceId,
    candidate.derivationId,
    candidate.corpusVersion
  );
  if (existingItem) {
    await markCorpusCandidatePromoted(candidate.id, existingItem.id);
    const updated = (await getCorpusCandidateById(candidate.id)) ?? candidate;
    return { candidate: updated, item: existingItem, created: false };
  }

  if (!candidate.clientProfileId) {
    throw new CorpusCandidatePromotionError(
      "Candidate is missing client profile",
      "missing_client_profile"
    );
  }

  const cohort = classifyCohort(input.cohort);
  const item = await insertCorpusItem({
    workspaceId: candidate.workspaceId,
    clientProfileId: candidate.clientProfileId,
    campaignId: candidate.campaignId,
    derivationId: candidate.derivationId,
    generationMode: candidate.generationMode,
    format: candidate.format,
    cohort,
    corpusVersion: candidate.corpusVersion,
    artifactRef: candidate.artifactRef as unknown as Record<string, unknown>,
    qualitySnapshot: candidate.qualitySnapshot as unknown as Record<string, unknown>,
    selectedByUserId: input.selectedByUserId,
  });

  const updatedCandidate =
    (await markCorpusCandidatePromoted(candidate.id, item.id)) ?? candidate;

  return { candidate: updatedCandidate, item, created: true };
}
