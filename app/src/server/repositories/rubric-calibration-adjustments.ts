import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "../db";
import {
  rubricCalibrationAdjustments,
  type RubricCalibrationAdjustment,
} from "../db/schema";
import type { CalibrationAdjustmentEvidence } from "../human-quality/calibration/types";
import { MIN_SLICE_SAMPLE } from "../human-quality/calibration/report";
import type { QualityImprovementChangeSpec } from "../human-quality/improvement/types";
import { CalibrationAdjustmentError } from "./calibration-adjustment-errors";

export type AdjustmentTargetModule =
  | "score_ceiling"
  | "observable_rubric"
  | "gate_classifier";

export interface InsertProposedAdjustmentInput {
  adjustmentVersion: string;
  targetModule: AdjustmentTargetModule;
  targetKey: string;
  sliceKey: string;
  rationale: string;
  evidenceRefs: CalibrationAdjustmentEvidence;
}

export interface ListProposedAdjustmentsFilters {
  adjustmentVersion?: string;
  status?: "proposed";
}

export interface ListAcceptedAdjustmentsFilters {
  adjustmentVersion?: string;
  status?: "accepted";
}

export interface AcceptAdjustmentRepoInput {
  adjustmentId: string;
  reviewerUserId: string;
  changeSpec?: QualityImprovementChangeSpec | null;
}

export interface RejectAdjustmentRepoInput {
  adjustmentId: string;
  reviewerUserId: string;
  reason: string;
}

export async function insertProposedAdjustment(
  input: InsertProposedAdjustmentInput
): Promise<RubricCalibrationAdjustment> {
  const [row] = await db
    .insert(rubricCalibrationAdjustments)
    .values({
      adjustmentVersion: input.adjustmentVersion,
      status: "proposed",
      targetModule: input.targetModule,
      targetKey: input.targetKey,
      sliceKey: input.sliceKey,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
    })
    .returning();

  return row;
}

export async function listProposedAdjustments(
  filters: ListProposedAdjustmentsFilters = {}
): Promise<RubricCalibrationAdjustment[]> {
  const conditions = [];

  if (filters.adjustmentVersion) {
    conditions.push(
      eq(rubricCalibrationAdjustments.adjustmentVersion, filters.adjustmentVersion)
    );
  }

  if (filters.status) {
    conditions.push(eq(rubricCalibrationAdjustments.status, filters.status));
  } else {
    conditions.push(eq(rubricCalibrationAdjustments.status, "proposed"));
  }

  return db
    .select()
    .from(rubricCalibrationAdjustments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(rubricCalibrationAdjustments.proposedAt));
}

export async function listAcceptedAdjustments(
  filters: ListAcceptedAdjustmentsFilters = {}
): Promise<RubricCalibrationAdjustment[]> {
  const conditions = [eq(rubricCalibrationAdjustments.status, "accepted")];

  if (filters.adjustmentVersion) {
    conditions.push(
      eq(rubricCalibrationAdjustments.adjustmentVersion, filters.adjustmentVersion)
    );
  }

  return db
    .select()
    .from(rubricCalibrationAdjustments)
    .where(and(...conditions))
    .orderBy(desc(rubricCalibrationAdjustments.acceptedAt));
}

export async function findProposedAdjustmentBySlice(
  sliceKey: string,
  adjustmentVersion: string,
  targetModule: AdjustmentTargetModule,
  targetKey: string
): Promise<RubricCalibrationAdjustment | null> {
  const [row] = await db
    .select()
    .from(rubricCalibrationAdjustments)
    .where(
      and(
        eq(rubricCalibrationAdjustments.sliceKey, sliceKey),
        eq(rubricCalibrationAdjustments.adjustmentVersion, adjustmentVersion),
        eq(rubricCalibrationAdjustments.targetModule, targetModule),
        eq(rubricCalibrationAdjustments.targetKey, targetKey),
        eq(rubricCalibrationAdjustments.status, "proposed")
      )
    )
    .limit(1);

  return row ?? null;
}

export async function findAdjustmentById(
  adjustmentId: string
): Promise<RubricCalibrationAdjustment | null> {
  const [row] = await db
    .select()
    .from(rubricCalibrationAdjustments)
    .where(eq(rubricCalibrationAdjustments.id, adjustmentId))
    .limit(1);

  return row ?? null;
}

export async function supersedeAcceptedForSlice(
  sliceKey: string,
  adjustmentVersion: string,
  targetModule: AdjustmentTargetModule,
  targetKey: string,
  excludeId: string
): Promise<RubricCalibrationAdjustment[]> {
  return db
    .update(rubricCalibrationAdjustments)
    .set({ status: "superseded" })
    .where(
      and(
        eq(rubricCalibrationAdjustments.sliceKey, sliceKey),
        eq(rubricCalibrationAdjustments.adjustmentVersion, adjustmentVersion),
        eq(rubricCalibrationAdjustments.targetModule, targetModule),
        eq(rubricCalibrationAdjustments.targetKey, targetKey),
        eq(rubricCalibrationAdjustments.status, "accepted"),
        ne(rubricCalibrationAdjustments.id, excludeId)
      )
    )
    .returning();
}

export async function acceptAdjustment(
  input: AcceptAdjustmentRepoInput
): Promise<RubricCalibrationAdjustment> {
  const row = await findAdjustmentById(input.adjustmentId);

  if (!row) {
    throw new CalibrationAdjustmentError(
      "adjustment_not_found",
      `Adjustment ${input.adjustmentId} not found`
    );
  }

  if (row.status !== "proposed") {
    throw new CalibrationAdjustmentError(
      "adjustment_not_proposed",
      `Adjustment ${input.adjustmentId} is not proposed (status=${row.status})`
    );
  }

  if (row.evidenceRefs.corpusItemIds.length < MIN_SLICE_SAMPLE) {
    throw new CalibrationAdjustmentError(
      "insufficient_evidence",
      `Adjustment ${input.adjustmentId} has insufficient corpus evidence`
    );
  }

  const acceptedAt = new Date();

  const [updated] = await db
    .update(rubricCalibrationAdjustments)
    .set({
      status: "accepted",
      acceptedAt,
      acceptedBy: input.reviewerUserId,
      changeSpec: input.changeSpec ?? null,
    })
    .where(eq(rubricCalibrationAdjustments.id, input.adjustmentId))
    .returning();

  return updated;
}

export async function rejectAdjustment(
  input: RejectAdjustmentRepoInput
): Promise<RubricCalibrationAdjustment> {
  const row = await findAdjustmentById(input.adjustmentId);

  if (!row) {
    throw new CalibrationAdjustmentError(
      "adjustment_not_found",
      `Adjustment ${input.adjustmentId} not found`
    );
  }

  if (row.status !== "proposed") {
    throw new CalibrationAdjustmentError(
      "adjustment_not_proposed",
      `Adjustment ${input.adjustmentId} is not proposed (status=${row.status})`
    );
  }

  const rejectedAt = new Date();

  const [updated] = await db
    .update(rubricCalibrationAdjustments)
    .set({
      status: "rejected",
      rejectedReason: input.reason.trim(),
      rejectedAt,
      rejectedBy: input.reviewerUserId,
    })
    .where(eq(rubricCalibrationAdjustments.id, input.adjustmentId))
    .returning();

  return updated;
}
