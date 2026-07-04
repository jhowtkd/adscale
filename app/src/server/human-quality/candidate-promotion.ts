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
import type { HumanQualitySourceLabel } from "./corpus";
import { classifyCohort, isHumanQualityCorpusCohort } from "./corpus";
import { parseOwnerPromotionSourceLabel } from "./source-label";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";

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
  selectedByUserId?: string;
  autoPromoted?: boolean;
  sourceLabel?: string;
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

  // Goal-agent contract: global corpus promotion fails closed without active
  // client consent. The candidate is retained for owner review, but it never
  // reaches the global corpus until the client explicitly grants consent.
  const consent = await getCorpusConsent(
    candidate.workspaceId,
    candidate.clientProfileId
  );
  if (!consent || consent.status !== "granted") {
    throw new CorpusCandidatePromotionError(
      "Client consent is required for corpus promotion",
      "client_consent_required"
    );
  }

  const resolvedSourceLabel = parseOwnerPromotionSourceLabel(
    input.sourceLabel,
    candidate.sourceLabel
  );
  if (!resolvedSourceLabel.ok) {
    throw new CorpusCandidatePromotionError(resolvedSourceLabel.error, "invalid_source_label");
  }

  const effectiveSourceLabel = resolvedSourceLabel.value;
  const markOptions =
    effectiveSourceLabel !== candidate.sourceLabel
      ? { sourceLabel: effectiveSourceLabel as HumanQualitySourceLabel }
      : undefined;

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
    selectedByUserId: input.selectedByUserId ?? null,
    autoPromoted: input.autoPromoted ?? false,
  });

  const updatedCandidate =
    (await markCorpusCandidatePromoted(candidate.id, item.id, markOptions)) ?? candidate;

  return { candidate: updatedCandidate, item, created: true };
}
