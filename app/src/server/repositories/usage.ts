import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { usageEvents } from "../db/schema";

export async function trackUsage(
  workspaceId: string,
  type: string,
  amount: number,
  metadata?: Record<string, unknown>,
  idempotencyKey?: string
) {
  const result = await db
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
}

export async function getUsageByIdempotencyKey(
  workspaceId: string,
  idempotencyKey: string
) {
  const rows = await db
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
