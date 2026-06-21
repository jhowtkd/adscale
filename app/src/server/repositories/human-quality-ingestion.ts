import { and, asc, eq, gt, isNotNull, or } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";

export interface BackfillDerivationRow {
  workspaceId: string;
  derivationId: string;
  createdAt: Date;
}

export async function listEligibleDerivationsForBackfill(input: {
  batchSize: number;
  cursor?: { createdAt: Date; id: string } | null;
  workspaceId?: string;
}): Promise<BackfillDerivationRow[]> {
  const conditions = [
    eq(derivations.status, "completed"),
    isNotNull(derivations.outputKey),
  ];

  if (input.workspaceId) {
    conditions.push(eq(derivations.workspaceId, input.workspaceId));
  }

  if (input.cursor) {
    conditions.push(
      or(
        gt(derivations.createdAt, input.cursor.createdAt),
        and(
          eq(derivations.createdAt, input.cursor.createdAt),
          gt(derivations.id, input.cursor.id)
        )
      )!
    );
  }

  const rows = await db
    .select({
      workspaceId: derivations.workspaceId,
      derivationId: derivations.id,
      createdAt: derivations.createdAt,
    })
    .from(derivations)
    .where(and(...conditions))
    .orderBy(asc(derivations.createdAt), asc(derivations.id))
    .limit(input.batchSize);

  return rows;
}
