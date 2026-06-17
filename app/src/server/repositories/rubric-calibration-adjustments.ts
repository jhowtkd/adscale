import { and, desc, eq } from "drizzle-orm";

import { db } from "../db";
import {
  rubricCalibrationAdjustments,
  type RubricCalibrationAdjustment,
} from "../db/schema";
import type { CalibrationAdjustmentEvidence } from "../human-quality/calibration/types";

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
