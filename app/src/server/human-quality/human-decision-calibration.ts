import type { HumanQualityCorpusItem, HumanQualityEvaluation } from "@/server/db/schema";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";
import { recordCalibrationSignalFromOutputDecisionEvent } from "@/server/brand-taste/calibration-signal-recorder";
import type { CalibrationSourceLabel } from "@/server/brand-taste/calibration-signal-types";
import { recordOutputDecisionEvidence } from "@/server/output-learning/output-decision-recorder";
import {
  buildOutputDecisionSnapshot,
  type OutputDecisionAction,
  type OutputDecisionSnapshot,
} from "@/server/output-learning/output-decision-events";
import type {
  HumanQualityIntent,
  HumanQualityQualitySnapshot,
  HumanQualitySourceLabel,
} from "./corpus";

export interface RecordHumanDecisionCalibrationInput {
  item: HumanQualityCorpusItem;
  evaluation: HumanQualityEvaluation;
  reviewerUserId: string;
  sourceLabel: HumanQualitySourceLabel;
  feedbackArtifactId?: string | null;
  evidenceSanitized?: boolean;
}

export type CalibrationSignalBridgeStatus =
  | "recorded"
  | "skipped_existing"
  | "skipped_unmappable"
  | "skipped_no_client_profile";

export interface HumanDecisionCalibrationResult {
  outputDecisionEventId: string;
  calibrationSignal: {
    status: CalibrationSignalBridgeStatus;
    signalId?: string;
  };
}

function mapIntentToAction(intent: HumanQualityIntent): OutputDecisionAction {
  switch (intent) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "regenerate":
      return "regenerated";
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

function buildSnapshotExtrasFromEvaluation(
  evaluation: HumanQualityEvaluation,
  intent: HumanQualityIntent
): Partial<OutputDecisionSnapshot> {
  const reasonText =
    evaluation.otherReasonText?.trim() || evaluation.notes?.trim() || undefined;

  if (intent === "approve") {
    return reasonText
      ? {
          reason: {
            code: "approved",
            text: reasonText,
            source: "human_quality_evaluation",
          },
        }
      : {};
  }

  return {
    reason: {
      code: evaluation.primaryFailureReason,
      text: reasonText,
      source: "human_quality_evaluation",
    },
  };
}

function buildSnapshotInputFromCorpusItem(
  item: HumanQualityCorpusItem
): Parameters<typeof buildOutputDecisionSnapshot>[0] {
  const snapshot = (item.qualitySnapshot ?? {}) as HumanQualityQualitySnapshot;
  return {
    generationMode: snapshot.generationMode,
    format: snapshot.format,
    variantIndex: snapshot.variantIndex,
    ctaText: snapshot.ctaText,
    status: snapshot.status,
    qualityScore: snapshot.qualityScore,
    qualityVerdict: snapshot.qualityVerdict,
    scoreStatus: snapshot.scoreStatus,
    hardFailures: snapshot.hardFailures,
    scoreIssues: snapshot.scoreIssues,
    polishSuggestions: snapshot.polishSuggestions,
    creativeLevel: snapshot.creativeLevel,
  };
}

export async function recordHumanDecisionCalibrationEvidence(
  input: RecordHumanDecisionCalibrationInput
): Promise<HumanDecisionCalibrationResult> {
  const { item, evaluation, reviewerUserId, sourceLabel } = input;
  if (
    evaluation.workspaceId !== item.workspaceId ||
    evaluation.corpusItemId !== item.id ||
    evaluation.reviewerUserId !== reviewerUserId
  ) {
    throw new FeedbackValidationError("Evaluation does not match the corpus scope and reviewer", "invalid_evaluation");
  }
  const intent = evaluation.intent as HumanQualityIntent;
  const action = mapIntentToAction(intent);
  const reviewedAt =
    evaluation.createdAt?.toISOString() ?? new Date().toISOString();

  const outputDecisionIdempotencyKey = `human-quality-evaluation:${evaluation.id}:output-decision`;
  const calibrationSignalIdempotencyKey = `human-quality-evaluation:${evaluation.id}:calibration-signal`;

  const event = await recordOutputDecisionEvidence({
    workspaceId: item.workspaceId,
    userId: reviewerUserId,
    clientProfileId: item.clientProfileId,
    campaignId: item.campaignId,
    derivationId: item.derivationId,
    action,
    source: "human-quality.corpus.evaluation",
    snapshotInput: buildSnapshotInputFromCorpusItem(item),
    snapshotExtras: {
      ...buildSnapshotExtrasFromEvaluation(evaluation, intent),
      automaticReason: (item.qualitySnapshot as HumanQualityQualitySnapshot)?.automaticReason,
      otherReasonText: evaluation.otherReasonText,
      notes: evaluation.notes,
      evidenceSanitized: input.evidenceSanitized || (item.qualitySnapshot as HumanQualityQualitySnapshot)?.evidenceSanitized,
      olharVerdict: (item.qualitySnapshot as HumanQualityQualitySnapshot)?.olharVerdict,
      exportStatus: (item.qualitySnapshot as HumanQualityQualitySnapshot)?.exportStatus,
    },
    idempotencyKey: outputDecisionIdempotencyKey,
  });

  if (!item.clientProfileId) {
    return {
      outputDecisionEventId: event.id,
      calibrationSignal: { status: "skipped_no_client_profile" },
    };
  }

  const calibrationResult = await recordCalibrationSignalFromOutputDecisionEvent({
    event,
    sourceLabel: sourceLabel as CalibrationSourceLabel,
    reviewedAt,
    idempotencyKey: calibrationSignalIdempotencyKey,
  });

  return {
    outputDecisionEventId: event.id,
    calibrationSignal: {
      status: calibrationResult.status,
      signalId: calibrationResult.signalId,
    },
  };
}
