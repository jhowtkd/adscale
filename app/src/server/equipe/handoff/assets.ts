import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeBrandHandoffs } from "@/server/db/equipe-schema";
export async function hasNonFreeAssetAccount(workspaceId: string) {
  const [paid] = await db.select({ id: equipeAccounts.id }).from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), ne(equipeAccounts.status, "free"))).limit(1);
  return Boolean(paid);
}
export async function isHandoffInWorkspace(workspaceId: string, handoffId: string) {
  const [handoff] = await db.select({ id: equipeBrandHandoffs.id }).from(equipeBrandHandoffs)
    .where(and(eq(equipeBrandHandoffs.workspaceId, workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
  return Boolean(handoff);
}
