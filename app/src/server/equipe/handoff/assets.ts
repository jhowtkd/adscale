import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeBrandHandoffs } from "@/server/db/equipe-schema";
export async function shouldAnalyzeWorkspaceAssets(workspaceId: string, clientProfileId?: string | null) {
  const accounts = await db.selectDistinct({ status: equipeAccounts.status }).from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), clientProfileId ? eq(equipeAccounts.clientProfileId, clientProfileId) : undefined));
  return accounts.length === 0 || accounts.some(account => account.status !== "free");
}
export async function getHandoffAssetScope(workspaceId: string, handoffId: string) {
  const [handoff] = await db.select({ id: equipeBrandHandoffs.id, readingId: equipeBrandHandoffs.readingId, step: equipeBrandHandoffs.step })
    .from(equipeBrandHandoffs).where(and(eq(equipeBrandHandoffs.workspaceId, workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
  return handoff && handoff.step !== "done" ? handoff : null;
}

export async function isHandoffInWorkspace(workspaceId: string, handoffId: string) {
  return Boolean(await getHandoffAssetScope(workspaceId, handoffId));
}
