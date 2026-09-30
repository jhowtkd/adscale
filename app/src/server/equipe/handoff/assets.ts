import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeBrandHandoffs } from "@/server/db/equipe-schema";
export async function isFreeAssetWorkspace(workspaceId: string) {
  const [free] = await db.select({ id: equipeAccounts.id }).from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), eq(equipeAccounts.status, "free"))).limit(1);
  return Boolean(free);
}
export async function getHandoffAssetScope(workspaceId: string, handoffId: string) {
  const [handoff] = await db.select({ id: equipeBrandHandoffs.id, readingId: equipeBrandHandoffs.readingId, step: equipeBrandHandoffs.step })
    .from(equipeBrandHandoffs).where(and(eq(equipeBrandHandoffs.workspaceId, workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
  return handoff && handoff.step !== "done" ? handoff : null;
}
