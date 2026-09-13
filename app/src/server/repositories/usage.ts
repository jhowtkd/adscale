import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";
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

export async function getUsageByIdempotencyKeys(workspaceId: string, keys: string[]) {
  if (keys.length === 0) return new Map<string, Awaited<ReturnType<typeof getUsageByIdempotencyKey>>>();
  const rows = await db.select().from(usageEvents).where(and(
    eq(usageEvents.workspaceId, workspaceId),
    inArray(usageEvents.idempotencyKey, keys),
  ));
  return new Map(rows.map((row) => [row.idempotencyKey!, row]));
}

export async function getUsageForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.workspaceId, workspaceId))
    .orderBy(desc(usageEvents.createdAt));
}

export async function listUsageEventsForOwner(filters: {
  workspaceId?: string;
  from?: Date;
  to?: Date;
} = {}) {
  const conditions = [];
  if (filters.workspaceId) {
    conditions.push(eq(usageEvents.workspaceId, filters.workspaceId));
  }
  if (filters.from) {
    conditions.push(gte(usageEvents.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(usageEvents.createdAt, filters.to));
  }

  const query = db
    .select({
      workspaceId: usageEvents.workspaceId,
      amount: usageEvents.amount,
      metadata: usageEvents.metadata,
      createdAt: usageEvents.createdAt,
    })
    .from(usageEvents)
    .orderBy(desc(usageEvents.createdAt));

  return conditions.length === 0 ? query : query.where(and(...conditions));
}
