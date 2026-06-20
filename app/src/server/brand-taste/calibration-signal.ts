import type { OutputDecisionEvent } from "@/server/db/schema";
import type { OutputDecisionSnapshot } from "@/server/output-learning/output-decision-events";
import {
  CALIBRATION_MISMATCH_BUCKETS,
  CALIBRATION_SOURCE_LABELS,
  HUMAN_CALIBRATION_VERDICTS,
  type CalibrationMismatchBucket,
  type CalibrationSignalPayload,
  type CalibrationSourceLabel,
  type HumanCalibrationVerdict,
} from "./calibration-signal-types";

const FORBIDDEN_NOTE_PATTERNS = [
  /prompt/i,
  /signedurl/i,
  /x-amz-signature/i,
  /postgres:\/\//i,
  /database_url/i,
];

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

export function sanitizeCalibrationNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const trimmed = note.trim().slice(0, 1000);
  if (!trimmed) return null;

  for (const pattern of FORBIDDEN_NOTE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return null;
    }
  }

  return trimmed;
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
  event: Pick<OutputDecisionEvent, "action" | "contextSnapshot">
): HumanCalibrationVerdict | null {
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

export function mismatchBucketFromSnapshot(
  snapshot: OutputDecisionSnapshot
): CalibrationMismatchBucket | null {
  const code = snapshot.reason?.code;
  if (code && isCalibrationMismatchBucket(code)) {
    return code;
  }
  if (snapshot.reason?.source && isCalibrationMismatchBucket(snapshot.reason.source)) {
    return snapshot.reason.source;
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

  return {
    workspaceId: input.event.workspaceId,
    clientProfileId: input.event.clientProfileId,
    campaignId: input.event.campaignId,
    derivationId: input.event.derivationId,
    outputDecisionEventId: input.event.id,
    humanVerdict,
    systemOlharVerdict: snapshot.olharVerdict?.value ?? null,
    systemExportStatus: snapshot.exportStatus?.value ?? null,
    mismatchBucket: mismatchBucketFromSnapshot(snapshot),
    sourceLabel: input.sourceLabel,
    reviewerId: input.event.userId,
    reviewedAt: input.reviewedAt ?? input.event.createdAt.toISOString(),
    sanitizedNote: sanitizeCalibrationNote(snapshot.reason?.text),
    idempotencyKey:
      input.idempotencyKey ??
      `calibration-signal:${input.event.workspaceId}:${input.event.derivationId}:${input.event.userId}`,
  };
}

export function buildCalibrationIdempotencyKey(input: {
  workspaceId: string;
  derivationId: string;
  reviewerId: string;
}): string {
  return `calibration-signal:${input.workspaceId}:${input.derivationId}:${input.reviewerId}`;
}

export function validateCalibrationSignalPayload(
  payload: CalibrationSignalPayload
): string[] {
  const errors: string[] = [];

  if (!payload.workspaceId) errors.push("workspaceId is required");
  if (!payload.campaignId) errors.push("campaignId is required");
  if (!payload.derivationId) errors.push("derivationId is required");
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
