import { FeedbackValidationError } from "@/server/feedback/validate-refs";
import { getCampaignById, updateCampaign } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import { getDerivationById } from "@/server/repositories/derivation";
import {
  findCorpusItemByDerivationVersion,
  getCorpusItemByIdAnyWorkspace,
  getCorpusItemById,
  insertCorpusItem,
  listPendingCorpusItems,
  listCorpusQueueItems,
  submitCorpusEvaluation,
  getCorpusOperationsProgress,
  type InsertCorpusItemInput,
  type ListCorpusQueueFilters,
} from "@/server/repositories/human-quality-corpus";
import { findCorpusCandidateByDerivationVersion } from "@/server/repositories/human-quality-candidate";
import {
  findEvaluationByCorpusItemId,
  insertFeedbackArtifact,
} from "@/server/repositories/human-quality-feedback-artifact";
import {
  buildHumanQualityFeedbackArtifactPayload,
  resolveCorpusSourceLabel,
} from "./feedback-artifact";
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
import {
  resolveOutputLearningApplication,
  sanitizeOutputLearningApplication,
} from "./application-schema";
import type { OutputLearningApplicationSnapshot } from "./corpus";

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
  workspaceId?: string;
  limit?: number;
}

export interface ListCorpusQueueInput extends ListCorpusQueueFilters {}

export interface CorpusQueueItemView {
  item: HumanQualityCorpusItem;
  sourceLabel: import("./corpus").HumanQualitySourceLabel;
}

export const MAX_CORPUS_BATCH_SIZE = 25;

export type BatchSelectCorpusOutcome =
  | "selected"
  | "duplicate"
  | "invalid"
  | "missing_profile"
  | "unsafe_payload";

export interface BatchSelectCorpusItemResult {
  derivationId: string;
  outcome: BatchSelectCorpusOutcome;
  item?: HumanQualityCorpusItem;
  errorCode?: string;
  message?: string;
}

export interface BatchSelectCorpusInput {
  workspaceId: string;
  campaignId: string;
  selectedByUserId: string;
  derivationIds: string[];
  cohort?: string | null;
  corpusVersion?: number;
  artifactRef?: Record<string, unknown>;
  qualitySnapshot?: Record<string, unknown>;
}

export interface BatchSelectCorpusSummary {
  total: number;
  selected: number;
  duplicate: number;
  invalid: number;
  missingProfile: number;
  unsafePayload: number;
}

export interface BatchSelectCorpusResult {
  results: BatchSelectCorpusItemResult[];
  summary: BatchSelectCorpusSummary;
}

export interface CorpusQueueProgress {
  workspaceId: string | null;
  totalPending: number;
  totalEvaluated: number;
  byCohort: Record<string, { pending: number; evaluated: number }>;
  byGenerationMode: Record<string, { pending: number; evaluated: number }>;
  byFormat: Record<string, { pending: number; evaluated: number }>;
  byCampaign: Record<string, { pending: number; evaluated: number }>;
  latestSelectedAt: string | null;
  latestEvaluatedAt: string | null;
}

export interface GetCorpusQueueProgressInput extends Omit<ListCorpusQueueFilters, "limit" | "status"> {
  workspaceId?: string;
}

export interface SubmitHumanEvaluationInput {
  workspaceId?: string;
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
  }) as Record<string, unknown>;
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

  const clientProfileId = await resolveCampaignClientProfileId(input.workspaceId, {
    clientProfileId: campaign.clientProfileId,
    client: campaign.client,
  });

  if (!clientProfileId) {
    throw new HumanQualityServiceError(
      "Campaign is missing client profile for corpus selection",
      "missing_client_profile"
    );
  }

  if (!campaign.clientProfileId) {
    await updateCampaign(campaign.id, input.workspaceId, { clientProfileId });
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
  const baseQualitySnapshot =
    input.qualitySnapshot ?? buildQualitySnapshotFromDerivation(derivation);
  const storedApplication = derivation.outputLearningApplication as
    | OutputLearningApplicationSnapshot
    | null
    | undefined;
  let outputLearningApplication: OutputLearningApplicationSnapshot;
  try {
    outputLearningApplication = storedApplication
      ? sanitizeOutputLearningApplication(
          storedApplication as unknown as Record<string, unknown>
        )
      : resolveOutputLearningApplication(null);
  } catch (error) {
    throw new HumanQualityServiceError(
      error instanceof Error ? error.message : "Invalid output learning snapshot",
      "invalid_quality_snapshot"
    );
  }
  const qualitySnapshot = {
    ...baseQualitySnapshot,
    outputLearningApplication,
  };

  const insertInput: InsertCorpusItemInput = {
    workspaceId: input.workspaceId,
    clientProfileId,
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

function mapSelectErrorToBatchOutcome(
  error: unknown
): Pick<BatchSelectCorpusItemResult, "outcome" | "errorCode" | "message"> {
  if (error instanceof HumanQualityServiceError) {
    if (error.code === "duplicate_corpus_item") {
      return { outcome: "duplicate", errorCode: error.code, message: error.message };
    }
    if (error.code === "missing_client_profile") {
      return { outcome: "missing_profile", errorCode: error.code, message: error.message };
    }
    if (error.code === "forbidden_corpus_payload") {
      return { outcome: "unsafe_payload", errorCode: error.code, message: error.message };
    }
  }

  if (error instanceof FeedbackValidationError) {
    return { outcome: "invalid", errorCode: error.code, message: error.message };
  }

  throw error;
}

export async function batchSelectDerivationsForCorpus(
  input: BatchSelectCorpusInput
): Promise<BatchSelectCorpusResult> {
  if (input.derivationIds.length === 0) {
    throw new HumanQualityServiceError(
      "derivationIds must contain at least one id",
      "validation_error"
    );
  }

  if (input.derivationIds.length > MAX_CORPUS_BATCH_SIZE) {
    throw new HumanQualityServiceError(
      `derivationIds exceeds batch size cap of ${MAX_CORPUS_BATCH_SIZE}`,
      "batch_size_exceeded"
    );
  }

  const results: BatchSelectCorpusItemResult[] = [];
  const summary: BatchSelectCorpusSummary = {
    total: input.derivationIds.length,
    selected: 0,
    duplicate: 0,
    invalid: 0,
    missingProfile: 0,
    unsafePayload: 0,
  };

  for (const derivationId of input.derivationIds) {
    try {
      const item = await selectDerivationForCorpus({
        workspaceId: input.workspaceId,
        campaignId: input.campaignId,
        derivationId,
        selectedByUserId: input.selectedByUserId,
        cohort: input.cohort,
        corpusVersion: input.corpusVersion,
        artifactRef: input.artifactRef,
        qualitySnapshot: input.qualitySnapshot,
      });
      results.push({ derivationId, outcome: "selected", item });
      summary.selected += 1;
    } catch (error) {
      const mapped = mapSelectErrorToBatchOutcome(error);
      results.push({ derivationId, ...mapped });
      switch (mapped.outcome) {
        case "duplicate":
          summary.duplicate += 1;
          break;
        case "invalid":
          summary.invalid += 1;
          break;
        case "missing_profile":
          summary.missingProfile += 1;
          break;
        case "unsafe_payload":
          summary.unsafePayload += 1;
          break;
      }
    }
  }

  return { results, summary };
}

export async function getCorpusQueueProgress(
  input: GetCorpusQueueProgressInput
): Promise<CorpusQueueProgress> {
  const progress = await getCorpusOperationsProgress(input.workspaceId, input);

  return {
    workspaceId: input.workspaceId ?? null,
    totalPending: progress.totalPending,
    totalEvaluated: progress.totalEvaluated,
    byCohort: progress.byCohort,
    byGenerationMode: progress.byGenerationMode,
    byFormat: progress.byFormat,
    byCampaign: progress.byCampaign,
    latestSelectedAt: progress.latestSelectedAt?.toISOString() ?? null,
    latestEvaluatedAt: progress.latestEvaluatedAt?.toISOString() ?? null,
  };
}

export async function listPendingCorpusQueue(
  input: ListPendingCorpusQueueInput
): Promise<HumanQualityCorpusItem[]> {
  return listPendingCorpusItems({
    workspaceId: input.workspaceId,
    limit: input.limit,
  });
}

export async function listCorpusQueue(
  input: ListCorpusQueueInput
): Promise<CorpusQueueItemView[]> {
  return listCorpusQueueItems(input);
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

  const item = input.workspaceId
    ? await getCorpusItemById(input.workspaceId, input.corpusItemId)
    : await getCorpusItemByIdAnyWorkspace(input.corpusItemId);
  if (!item) {
    throw new HumanQualityServiceError("Corpus item not found", "corpus_item_not_found");
  }

  if (input.workspaceId && item.workspaceId !== input.workspaceId) {
    throw new HumanQualityServiceError(
      "Corpus item does not belong to workspace",
      "corpus_item_workspace_mismatch"
    );
  }

  if (item.status !== "pending") {
    throw new HumanQualityServiceError(
      "Corpus item is not pending evaluation",
      "corpus_item_not_pending"
    );
  }

  const existingEvaluation = await findEvaluationByCorpusItemId(input.corpusItemId);
  if (existingEvaluation) {
    throw new HumanQualityServiceError(
      "Corpus item already has an evaluation",
      "corpus_evaluation_duplicate"
    );
  }

  const result = await submitCorpusEvaluation({
    workspaceId: item.workspaceId,
    corpusItemId: input.corpusItemId,
    reviewerUserId: input.reviewerUserId,
    visualScore: visualScoreResult.value,
    factualPass: factualPassResult.value,
    intent: input.intent as HumanQualityIntent,
    primaryFailureReason: input.primaryFailureReason as HumanQualityFailureReason,
    otherReasonText: input.otherReasonText,
    notes: input.notes,
  });

  const candidate = await findCorpusCandidateByDerivationVersion(
    item.workspaceId,
    item.derivationId,
    item.corpusVersion
  );
  const sourceLabel = resolveCorpusSourceLabel(candidate?.sourceLabel);
  const payload = buildHumanQualityFeedbackArtifactPayload({
    item: result.item,
    evaluation: result.evaluation,
  });

  const feedbackArtifact = await insertFeedbackArtifact({
    workspaceId: item.workspaceId,
    corpusItemId: result.item.id,
    evaluationId: result.evaluation.id,
    derivationId: item.derivationId,
    campaignId: item.campaignId,
    clientProfileId: item.clientProfileId,
    sourceLabel,
    cohort: item.cohort,
    generationMode: item.generationMode,
    format: item.format,
    payload,
  });

  return { ...result, feedbackArtifact };
}
