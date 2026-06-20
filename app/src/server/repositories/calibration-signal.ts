import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  calibrationSignals,
  type CalibrationSignal,
  type NewCalibrationSignal,
} from "../db/schema";

export async function insertCalibrationSignal(
  input: NewCalibrationSignal
): Promise<CalibrationSignal> {
  const [row] = await db.insert(calibrationSignals).values(input).returning();
  return row;
}

export async function findCalibrationSignalByIdempotencyKey(
  workspaceId: string,
  idempotencyKey: string
): Promise<CalibrationSignal | null> {
  const rows = await db
    .select()
    .from(calibrationSignals)
    .where(
      and(
        eq(calibrationSignals.workspaceId, workspaceId),
        eq(calibrationSignals.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listCalibrationSignalsForClientProfile(input: {
  workspaceId: string;
  clientProfileId: string;
  limit?: number;
}): Promise<CalibrationSignal[]> {
  return db
    .select()
    .from(calibrationSignals)
    .where(
      and(
        eq(calibrationSignals.workspaceId, input.workspaceId),
        eq(calibrationSignals.clientProfileId, input.clientProfileId)
      )
    )
    .orderBy(desc(calibrationSignals.reviewedAt))
    .limit(input.limit ?? 500);
}

export async function listCalibrationSignalsForWorkspace(
  workspaceId: string,
  limit = 500
): Promise<CalibrationSignal[]> {
  return db
    .select()
    .from(calibrationSignals)
    .where(eq(calibrationSignals.workspaceId, workspaceId))
    .orderBy(desc(calibrationSignals.reviewedAt))
    .limit(limit);
}
