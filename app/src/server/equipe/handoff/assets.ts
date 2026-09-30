import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeBrandHandoffs } from "@/server/db/equipe-schema";
export async function shouldAnalyzeWorkspaceAssets(workspaceId: string) {
  const accounts = await db.selectDistinct({ status: equipeAccounts.status }).from(equipeAccounts)
    .where(eq(equipeAccounts.workspaceId, workspaceId));
  return accounts.length === 0 || accounts.some(account => account.status !== "free");
}
export async function isHandoffInWorkspace(workspaceId: string, handoffId: string) {
  const [handoff] = await db.select({ id: equipeBrandHandoffs.id }).from(equipeBrandHandoffs)
    .where(and(eq(equipeBrandHandoffs.workspaceId, workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
  return Boolean(handoff);
}
