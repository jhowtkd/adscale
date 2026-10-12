import type { OutputDecisionEvent } from "@/server/db/schema";
import type { OutputDecisionSnapshot } from "@/server/output-learning/output-decision-events";
import { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
export { sanitizeCalibrationNote } from "@/server/output-learning/output-decision-events";
import { classifyAgreement, inferMismatchBucket } from "@/server/olhar-calibration/cenbrap-calibration";
import type { OlharVerdictValue, ExportStatusValue } from "@/server/ai/olhar/dual-verdict";
import {
  CALIBRATION_MISMATCH_BUCKETS,
  CALIBRATION_SOURCE_LABELS,
  HUMAN_CALIBRATION_VERDICTS,
  type CalibrationMismatchBucket,
  type CalibrationSignalPayload,
  type CalibrationSourceLabel,
  type HumanCalibrationVerdict,
} from "./calibration-signal-types";

export function isHumanCalibrationVerdict(
  value: string
): value is HumanCalibrationVerdict {
  return (HUMAN_CALIBRATION_VERDICTS as readonly string[]).includes(value);
}

export function isCalibrationSourceLabel(
  value: string
): value is CalibrationSourceLabel {
  return (CALIBRATION_SOURCE_LABELS as readonly string[]).includes(value);
}

export function isCalibrationMismatchBucket(
  value: string
): value is CalibrationMismatchBucket {
  return (CALIBRATION_MISMATCH_BUCKETS as readonly string[]).includes(value);
}

function mapReviewCodeToVerdict(
  code: string | undefined
): HumanCalibrationVerdict | null {
  if (!code) return null;
  if (code === "quase" || code === "nao_entra") {
    return code;
  }
  if (isCalibrationMismatchBucket(code)) {
    return "nao_entra";
  }
  return null;
}

function verdictFromApprovedSnapshot(
  snapshot: OutputDecisionSnapshot
): HumanCalibrationVerdict {
  if (snapshot.overrideApproved) {
    return "entra";
  }
  return "entra";
}

export function humanVerdictFromOutputDecisionEvent(
  event: Pick<OutputDecisionEvent, "action" | "contextSnapshot" | "direction" | "strength">
): HumanCalibrationVerdict | null {
  if (event.strength === "weak" || event.direction === "neutral") return null;
  const snapshot = event.contextSnapshot ?? {};

  if (event.action === "approved") {
    return verdictFromApprovedSnapshot(snapshot);
  }

  if (event.action === "rejected") {
    return mapReviewCodeToVerdict(snapshot.reason?.code) ?? "nao_entra";
  }

  if (event.action === "regenerated") {
    return "quase";
  }

  return null;
}

export function buildCalibrationSignalFromOutputDecisionEvent(input: {
  event: OutputDecisionEvent;
  sourceLabel: CalibrationSourceLabel;
  reviewedAt?: string;
  idempotencyKey?: string | null;
}): CalibrationSignalPayload | null {
  const humanVerdict = humanVerdictFromOutputDecisionEvent(input.event);
  if (!humanVerdict) {
    return null;
  }

  const snapshot = input.event.contextSnapshot ?? {};
  const comparison = {
    olharVerdict: (snapshot.olharVerdict?.value ?? null) as OlharVerdictValue | null,
    exportStatus: (snapshot.exportStatus?.value ?? null) as ExportStatusValue | null,
    humanDecision: humanVerdict,
    overrideApproved: snapshot.overrideApproved,
  };

  return {
    workspaceId: input.event.workspaceId,
    clientProfileId: input.event.clientProfileId,
    campaignId: input.event.campaignId,
    derivationId: input.event.derivationId,
    ...(input.event.creativeWorkOutputId ? { creativeWorkOutputId: input.event.creativeWorkOutputId } : {}),
    outputDecisionEventId: input.event.id,
    humanVerdict,
    systemOlharVerdict: snapshot.olharVerdict?.value ?? null,
    systemExportStatus: snapshot.exportStatus?.value ?? null,
    mismatchBucket: classifyAgreement(comparison) === "mismatch" ? inferMismatchBucket(comparison) : null,
    sourceLabel: input.sourceLabel,
    reviewerId: input.event.userId,
    reviewedAt: input.reviewedAt ?? input.event.createdAt.toISOString(),
    sanitizedNote: sanitizeCalibrationNote(snapshot.reason?.text),
    idempotencyKey:
      input.idempotencyKey ??
      buildCalibrationIdempotencyKey({ ...input.event, reviewerId: input.event.userId }),
  };
}

export function buildCalibrationIdempotencyKey(input: {
  workspaceId: string;
  derivationId: string | null;
  creativeWorkOutputId?: string | null;
  reviewerId: string;
}): string {
  const piece = input.creativeWorkOutputId ? `creative-work-output:${input.creativeWorkOutputId}` : input.derivationId;
  return `calibration-signal:${input.workspaceId}:${piece}:${input.reviewerId}`;
}

export function validateCalibrationSignalPayload(
  payload: CalibrationSignalPayload
): string[] {
  const errors: string[] = [];

  if (!payload.workspaceId) errors.push("workspaceId is required");
  if (Boolean(payload.derivationId) === Boolean(payload.creativeWorkOutputId)) errors.push("exactly one Peça reference is required");
  if (payload.derivationId && !payload.campaignId) errors.push("campaignId is required for a legacy derivation");
  if (!payload.reviewerId) errors.push("reviewerId is required");
  if (!payload.reviewedAt) errors.push("reviewedAt is required");
  if (!isHumanCalibrationVerdict(payload.humanVerdict)) {
    errors.push("humanVerdict is invalid");
  }
  if (!isCalibrationSourceLabel(payload.sourceLabel)) {
    errors.push("sourceLabel is invalid");
  }
  if (
    payload.mismatchBucket != null &&
    !isCalibrationMismatchBucket(payload.mismatchBucket)
  ) {
    errors.push("mismatchBucket is invalid");
  }

  return errors;
}
