import { FeedbackValidationError } from "@/server/feedback/validate-refs";
import { getCampaignById } from "@/server/repositories/campaign";
import { getDerivationById } from "@/server/repositories/derivation";
import {
  findCorpusItemByDerivationVersion,
  getCorpusItemById,
  insertCorpusItem,
  listPendingCorpusItems,
  submitCorpusEvaluation,
  type InsertCorpusItemInput,
} from "@/server/repositories/human-quality-corpus";
import type { HumanQualityCorpusItem } from "@/server/db/schema";
import {
  buildQualitySnapshot,
  classifyCohort,
  isHumanQualityFailureReason,
  isHumanQualityIntent,
  validateFactualPass,
  validatePrivacySafePayload,
  validateVisualScore,
  type HumanQualityCorpusCohort,
  type HumanQualityFailureReason,
  type HumanQualityIntent,
} from "./corpus";

export class HumanQualityServiceError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "HumanQualityServiceError";
  }
}

export interface SelectCorpusItemInput {
  workspaceId: string;
  campaignId: string;
  derivationId: string;
  selectedByUserId: string;
  cohort?: string | null;
  corpusVersion?: number;
  artifactRef?: Record<string, unknown>;
  qualitySnapshot?: Record<string, unknown>;
}

export interface ListPendingCorpusQueueInput {
  workspaceId: string;
  limit?: number;
}

export interface SubmitHumanEvaluationInput {
  workspaceId: string;
  corpusItemId: string;
  reviewerUserId: string;
  visualScore: unknown;
  factualPass: unknown;
  intent: unknown;
  primaryFailureReason: unknown;
  otherReasonText?: string | null;
  notes?: string | null;
}

function buildArtifactRefFromDerivation(
  derivationId: string,
  derivation: {
    styleAssetId?: string | null;
  },
  override?: Record<string, unknown>
): Record<string, unknown> {
  if (override) {
    return { derivationId, ...override };
  }

  const ref: Record<string, unknown> = { derivationId };
  if (derivation.styleAssetId) {
    ref.styleAssetId = derivation.styleAssetId;
  }
  return ref;
}

function buildQualitySnapshotFromDerivation(derivation: {
  generationMode?: string | null;
  format?: string | null;
  variantIndex?: number | null;
  ctaText?: string | null;
  status?: string | null;
  qualityScore?: number | null;
  qualityVerdict?: string | null;
  scoreStatus?: string | null;
  hardFailures?: unknown;
  scoreIssues?: unknown;
  polishSuggestions?: unknown;
}): Record<string, unknown> {
  return buildQualitySnapshot({
    generationMode: derivation.generationMode,
    format: derivation.format,
    variantIndex: derivation.variantIndex,
    ctaText: derivation.ctaText,
    status: derivation.status,
    qualityScore: derivation.qualityScore,
    qualityVerdict: derivation.qualityVerdict,
    scoreStatus: derivation.scoreStatus,
    hardFailures: derivation.hardFailures,
    scoreIssues: derivation.scoreIssues,
    polishSuggestions: derivation.polishSuggestions,
  });
}

function assertBoundedPayload(
  label: string,
  payload: Record<string, unknown> | undefined
): void {
  if (!payload) return;
  const validation = validatePrivacySafePayload(payload);
  if (!validation.ok) {
    throw new HumanQualityServiceError(validation.error, "forbidden_corpus_payload");
  }
}

export async function selectDerivationForCorpus(
  input: SelectCorpusItemInput
): Promise<HumanQualityCorpusItem> {
  const corpusVersion = input.corpusVersion ?? 1;
  const cohort = classifyCohort(input.cohort);

  const derivation = await getDerivationById(input.derivationId, input.workspaceId);
  if (!derivation) {
    throw new FeedbackValidationError(
      "Derivation not found in workspace",
      "invalid_derivation"
    );
  }

  if (derivation.campaignId !== input.campaignId) {
    throw new FeedbackValidationError(
      "Derivation does not belong to campaign",
      "invalid_derivation_campaign"
    );
  }

  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    throw new FeedbackValidationError(
      "Campaign not found in workspace",
      "invalid_campaign"
    );
  }

  if (!campaign.clientProfileId) {
    throw new HumanQualityServiceError(
      "Campaign is missing client profile for corpus selection",
      "missing_client_profile"
    );
  }

  assertBoundedPayload("artifactRef", input.artifactRef);
  assertBoundedPayload("qualitySnapshot", input.qualitySnapshot);

  const existing = await findCorpusItemByDerivationVersion(
    input.workspaceId,
    input.derivationId,
    corpusVersion
  );
  if (existing) {
    throw new HumanQualityServiceError(
      "Corpus item already exists for derivation version",
      "duplicate_corpus_item"
    );
  }

  const artifactRef = buildArtifactRefFromDerivation(
    input.derivationId,
    derivation,
    input.artifactRef
  );
  const qualitySnapshot =
    input.qualitySnapshot ?? buildQualitySnapshotFromDerivation(derivation);

  const insertInput: InsertCorpusItemInput = {
    workspaceId: input.workspaceId,
    clientProfileId: campaign.clientProfileId,
    campaignId: input.campaignId,
    derivationId: input.derivationId,
    generationMode: derivation.generationMode ?? "art_variation",
    format: derivation.format ?? "",
    cohort: cohort as HumanQualityCorpusCohort,
    corpusVersion,
    artifactRef,
    qualitySnapshot,
    selectedByUserId: input.selectedByUserId,
  };

  return insertCorpusItem(insertInput);
}

export async function listPendingCorpusQueue(
  input: ListPendingCorpusQueueInput
): Promise<HumanQualityCorpusItem[]> {
  return listPendingCorpusItems({
    workspaceId: input.workspaceId,
    limit: input.limit,
  });
}

export async function submitHumanEvaluation(input: SubmitHumanEvaluationInput) {
  const visualScoreResult = validateVisualScore(input.visualScore);
  if (!visualScoreResult.ok) {
    throw new HumanQualityServiceError(visualScoreResult.error, "validation_error");
  }

  const factualPassResult = validateFactualPass(input.factualPass);
  if (!factualPassResult.ok) {
    throw new HumanQualityServiceError(factualPassResult.error, "validation_error");
  }

  if (typeof input.intent !== "string" || !isHumanQualityIntent(input.intent)) {
    throw new HumanQualityServiceError("intent must be approve, reject, or regenerate", "validation_error");
  }

  if (
    typeof input.primaryFailureReason !== "string" ||
    !isHumanQualityFailureReason(input.primaryFailureReason)
  ) {
    throw new HumanQualityServiceError(
      "primaryFailureReason must be a valid failure reason",
      "validation_error"
    );
  }

  const item = await getCorpusItemById(input.workspaceId, input.corpusItemId);
  if (!item) {
    throw new HumanQualityServiceError("Corpus item not found", "corpus_item_not_found");
  }

  if (item.status !== "pending") {
    throw new HumanQualityServiceError(
      "Corpus item is not pending evaluation",
      "corpus_item_not_pending"
    );
  }

  return submitCorpusEvaluation({
    workspaceId: input.workspaceId,
    corpusItemId: input.corpusItemId,
    reviewerUserId: input.reviewerUserId,
    visualScore: visualScoreResult.value,
    factualPass: factualPassResult.value,
    intent: input.intent as HumanQualityIntent,
    primaryFailureReason: input.primaryFailureReason as HumanQualityFailureReason,
    otherReasonText: input.otherReasonText,
    notes: input.notes,
  });
}
