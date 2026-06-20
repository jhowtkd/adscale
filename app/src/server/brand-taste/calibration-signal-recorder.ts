import type { OutputDecisionEvent } from "@/server/db/schema";
import {
  findCalibrationSignalByIdempotencyKey,
  insertCalibrationSignal,
} from "@/server/repositories/calibration-signal";
import {
  buildCalibrationIdempotencyKey,
  buildCalibrationSignalFromOutputDecisionEvent,
  validateCalibrationSignalPayload,
} from "./calibration-signal";
import type {
  CalibrationSignalPayload,
  CalibrationSourceLabel,
} from "./calibration-signal-types";

export type RecordCalibrationSignalInput = CalibrationSignalPayload;

export interface RecordCalibrationSignalFromEventInput {
  event: OutputDecisionEvent;
  sourceLabel: CalibrationSourceLabel;
  reviewedAt?: string;
  idempotencyKey?: string | null;
}

export async function recordCalibrationSignal(
  input: RecordCalibrationSignalInput
): Promise<{ status: "recorded" | "skipped_existing"; signalId: string }> {
  const errors = validateCalibrationSignalPayload(input);
  if (errors.length > 0) {
    throw new Error(`Invalid calibration signal: ${errors.join(", ")}`);
  }

  const idempotencyKey =
    input.idempotencyKey ??
    buildCalibrationIdempotencyKey({
      workspaceId: input.workspaceId,
      derivationId: input.derivationId,
      reviewerId: input.reviewerId,
    });

  const existing = await findCalibrationSignalByIdempotencyKey(
    input.workspaceId,
    idempotencyKey
  );
  if (existing) {
    return { status: "skipped_existing", signalId: existing.id };
  }

  const row = await insertCalibrationSignal({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    campaignId: input.campaignId,
    derivationId: input.derivationId,
    outputDecisionEventId: input.outputDecisionEventId,
    humanVerdict: input.humanVerdict,
    systemOlharVerdict: input.systemOlharVerdict,
    systemExportStatus: input.systemExportStatus,
    mismatchBucket: input.mismatchBucket,
    sourceLabel: input.sourceLabel,
    reviewerId: input.reviewerId,
    reviewedAt: new Date(input.reviewedAt),
    sanitizedNote: input.sanitizedNote,
    idempotencyKey,
  });

  return { status: "recorded", signalId: row.id };
}

export async function recordCalibrationSignalFromOutputDecisionEvent(
  input: RecordCalibrationSignalFromEventInput
): Promise<{ status: "recorded" | "skipped_existing" | "skipped_unmappable"; signalId?: string }> {
  const payload = buildCalibrationSignalFromOutputDecisionEvent(input);
  if (!payload) {
    return { status: "skipped_unmappable" };
  }

  const result = await recordCalibrationSignal(payload);
  return result;
}
