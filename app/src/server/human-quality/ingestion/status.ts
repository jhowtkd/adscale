import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  derivations,
  humanQualityCorpusCandidates,
  humanQualityCorpusItems,
} from "../../db/schema";

export interface CorpusIngestionStatus {
  eligibleDerivations: number;
  totalCandidates: number;
  pendingQueue: number;
  evaluated: number;
  blockedMissingClientProfile: number;
}

export async function getCorpusIngestionStatus(): Promise<CorpusIngestionStatus> {
  const [eligibleRow, candidatesRow, pendingRow, evaluatedRow, blockedRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(derivations)
      .where(and(eq(derivations.status, "completed"), isNotNull(derivations.outputKey))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(humanQualityCorpusCandidates),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(humanQualityCorpusItems)
      .where(eq(humanQualityCorpusItems.status, "pending")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(humanQualityCorpusItems)
      .where(eq(humanQualityCorpusItems.status, "evaluated")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(humanQualityCorpusCandidates)
      .where(
        and(
          isNull(humanQualityCorpusCandidates.clientProfileId),
          isNull(humanQualityCorpusCandidates.promotedCorpusItemId)
        )
      ),
  ]);

  return {
    eligibleDerivations: eligibleRow[0]?.count ?? 0,
    totalCandidates: candidatesRow[0]?.count ?? 0,
    pendingQueue: pendingRow[0]?.count ?? 0,
    evaluated: evaluatedRow[0]?.count ?? 0,
    blockedMissingClientProfile: blockedRow[0]?.count ?? 0,
  };
}
