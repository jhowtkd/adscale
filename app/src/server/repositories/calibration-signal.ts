import { selectionDecisionIsCurrentSql } from "./selection-decisions";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  calibrationSignals, creativeWorkSelectionDecisions, outputDecisionEvents,
  type CalibrationSignal,
  type NewCalibrationSignal,
} from "../db/schema";

export async function insertCalibrationSignal(
  input: NewCalibrationSignal
): Promise<CalibrationSignal> {
  const insert = db.insert(calibrationSignals).values(input);
  const [row] = input.idempotencyKey
    ? await insert.onConflictDoNothing({
        target: [calibrationSignals.workspaceId, calibrationSignals.idempotencyKey],
        where: sql`${calibrationSignals.idempotencyKey} is not null`,
      }).returning()
    : await insert.returning();
  if (row) return row;

  const existing = await findCalibrationSignalByIdempotencyKey(input.workspaceId, input.idempotencyKey!);
  if (!existing) throw new Error("Calibration signal was not persisted");
  return existing;
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
  /** For proposals: selection approvals contribute only while they are the current choice. */
  prospective?: boolean;
}): Promise<CalibrationSignal[]> {
  return db
    .select()
    .from(calibrationSignals)
    .where(
      and(
        eq(calibrationSignals.workspaceId, input.workspaceId),
        eq(calibrationSignals.clientProfileId, input.clientProfileId),
        sql`${calibrationSignals.authorType} in ('human', 'equipe_actor')`,
        input.prospective ? sql`(
          ${calibrationSignals.idempotencyKey} is null
          or ${calibrationSignals.idempotencyKey} not like 'selection-decision:%:signal'
          or exists (select 1 from ${creativeWorkSelectionDecisions}
            where ${creativeWorkSelectionDecisions.workspaceId} = ${calibrationSignals.workspaceId}
              and ${creativeWorkSelectionDecisions.clientProfileId} = ${calibrationSignals.clientProfileId}
              and ${creativeWorkSelectionDecisions.outputId} = ${calibrationSignals.creativeWorkOutputId}
              and ${creativeWorkSelectionDecisions.userId} = ${calibrationSignals.reviewerId}
              and ${calibrationSignals.idempotencyKey} = 'selection-decision:' || ${creativeWorkSelectionDecisions.id}::text || ':signal'
              and ${selectionDecisionIsCurrentSql()}
              and exists (select 1 from ${outputDecisionEvents}
                where ${outputDecisionEvents.id} = ${calibrationSignals.outputDecisionEventId}
                  and ${outputDecisionEvents.workspaceId} = ${calibrationSignals.workspaceId}
                  and ${outputDecisionEvents.clientProfileId} = ${calibrationSignals.clientProfileId}
                  and ${outputDecisionEvents.creativeWorkOutputId} = ${creativeWorkSelectionDecisions.outputId}
                  and ${outputDecisionEvents.userId} = ${creativeWorkSelectionDecisions.userId}
                  and ${outputDecisionEvents.action} = 'approved'
                  and ${outputDecisionEvents.idempotencyKey} = 'selection-decision:' || ${creativeWorkSelectionDecisions.id}::text || ':approved'))
        )` : undefined
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
    .where(and(eq(calibrationSignals.workspaceId, workspaceId), sql`${calibrationSignals.authorType} in ('human', 'equipe_actor')`))
    .orderBy(desc(calibrationSignals.reviewedAt))
    .limit(limit);
}
