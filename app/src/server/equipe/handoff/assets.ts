import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeBrandHandoffs } from "@/server/db/equipe-schema";
export async function hasNonFreeAssetAccount(workspaceId: string, clientProfileId?: string | null) {
  const [paid] = await db.select({ id: equipeAccounts.id }).from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), ne(equipeAccounts.status, "free"), clientProfileId ? eq(equipeAccounts.clientProfileId, clientProfileId) : undefined)).limit(1);
  return Boolean(paid);
}
export async function getHandoffAssetScope(workspaceId: string, handoffId: string) {
  const [handoff] = await db.select({ id: equipeBrandHandoffs.id, readingId: equipeBrandHandoffs.readingId, step: equipeBrandHandoffs.step })
    .from(equipeBrandHandoffs).where(and(eq(equipeBrandHandoffs.workspaceId, workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
  return handoff && handoff.step !== "done" ? handoff : null;
}

export async function isHandoffInWorkspace(workspaceId: string, handoffId: string) {
  return Boolean(await getHandoffAssetScope(workspaceId, handoffId));
}
