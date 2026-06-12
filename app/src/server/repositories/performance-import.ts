import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  performanceImportBatches,
  performanceImportRows,
  type NewPerformanceImportBatch,
  type NewPerformanceImportRow,
  type PerformanceImportBatch,
  type PerformanceImportRow,
} from "../db/schema";

export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createPerformanceImportBatch(
  input: NewPerformanceImportBatch,
  tx: DbOrTx = db
): Promise<PerformanceImportBatch> {
  const [row] = await tx
    .insert(performanceImportBatches)
    .values(input)
    .returning();
  return row;
}

export async function updatePerformanceImportBatchCounts(
  batchId: string,
  counts: {
    createdCount: number;
    updatedCount: number;
    ignoredCount: number;
    invalidCount: number;
  },
  tx: DbOrTx = db
): Promise<PerformanceImportBatch> {
  const [row] = await tx
    .update(performanceImportBatches)
    .set(counts)
    .where(eq(performanceImportBatches.id, batchId))
    .returning();
  return row;
}

export async function createPerformanceImportRow(
  input: NewPerformanceImportRow,
  tx: DbOrTx = db
): Promise<PerformanceImportRow> {
  const [row] = await tx.insert(performanceImportRows).values(input).returning();
  return row;
}

export async function listPerformanceImportBatchesByCampaign(
  campaignId: string,
  workspaceId: string
): Promise<PerformanceImportBatch[]> {
  return db
    .select()
    .from(performanceImportBatches)
    .where(
      and(
        eq(performanceImportBatches.campaignId, campaignId),
        eq(performanceImportBatches.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(performanceImportBatches.createdAt));
}

export async function getPerformanceImportBatchById(
  batchId: string,
  workspaceId: string
): Promise<PerformanceImportBatch | null> {
  const [row] = await db
    .select()
    .from(performanceImportBatches)
    .where(
      and(
        eq(performanceImportBatches.id, batchId),
        eq(performanceImportBatches.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function listPerformanceImportRowsByBatch(
  batchId: string
): Promise<PerformanceImportRow[]> {
  return db
    .select()
    .from(performanceImportRows)
    .where(eq(performanceImportRows.batchId, batchId))
    .orderBy(performanceImportRows.rowIndex);
}
