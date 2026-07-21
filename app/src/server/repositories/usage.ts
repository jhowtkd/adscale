import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { usageEvents } from "../db/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function isUniqueIdempotencyViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export async function trackUsage(
  workspaceId: string,
  type: string,
  amount: number,
  metadata?: Record<string, unknown>,
  idempotencyKey?: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  try {
    const result = await client
      .insert(usageEvents)
      .values({
        workspaceId,
        type,
        amount,
        idempotencyKey,
        metadata: metadata ?? null,
      })
      .returning();
    return result[0];
  } catch (error) {
    if (idempotencyKey && isUniqueIdempotencyViolation(error)) {
      // Inside an open transaction Postgres marks the tx aborted after 23505.
      // Do not query on the same client — rethrow so the caller maps it to duplicate.
      if (tx) {
        throw error;
      }
      const existing = await getUsageByIdempotencyKey(
        workspaceId,
        idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

export async function getUsageByIdempotencyKey(
  workspaceId: string,
  idempotencyKey: string,
  tx?: DbOrTx
) {
  const client = tx ?? db;
  const rows = await client
    .select()
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, workspaceId),
        eq(usageEvents.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getUsageForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.workspaceId, workspaceId))
    .orderBy(desc(usageEvents.createdAt));
}
