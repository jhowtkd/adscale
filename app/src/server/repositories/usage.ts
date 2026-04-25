import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { usageEvents } from "../db/schema";

export async function trackUsage(
  workspaceId: string,
  type: string,
  amount: number,
  metadata?: Record<string, unknown>
) {
  const result = await db
    .insert(usageEvents)
    .values({
      workspaceId,
      type,
      amount,
      metadata: metadata ?? null,
    })
    .returning();
  return result[0];
}

export async function getUsageForWorkspace(workspaceId: string) {
  return db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.workspaceId, workspaceId))
    .orderBy(desc(usageEvents.createdAt));
}
