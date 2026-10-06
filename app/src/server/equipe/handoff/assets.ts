import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeBrandHandoffs } from "@/server/db/equipe-schema";
import { createWorkspaceAsset, type CreateWorkspaceAssetInput } from "@/server/repositories/workspace-asset";
import { findFreePlanAccount } from "@/server/equipe/module/free-plan";
export async function shouldAnalyzeWorkspaceAssets(workspaceId: string, clientProfileId?: string | null) {
  // The free plan (ticket 11, part 2): no classic analysis of any upload, a brand without an Equipe account included.
  // The upload itself goes on (the Biblioteca and the handoff use it); only the job is not enqueued.
  if (await findFreePlanAccount(workspaceId)) return false;
  const accounts = await db.selectDistinct({ status: equipeAccounts.status }).from(equipeAccounts)
    .where(and(eq(equipeAccounts.workspaceId, workspaceId), clientProfileId ? eq(equipeAccounts.clientProfileId, clientProfileId) : undefined));
  return accounts.length === 0 || accounts.some(account => account.status !== "free");
}
export async function getHandoffAssetScope(workspaceId: string, handoffId: string) {
  const [handoff] = await db.select({ id: equipeBrandHandoffs.id, readingId: equipeBrandHandoffs.readingId, step: equipeBrandHandoffs.step })
    .from(equipeBrandHandoffs).where(and(eq(equipeBrandHandoffs.workspaceId, workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
  return handoff && handoff.step !== "done" ? handoff : null;
}

export async function createHandoffWorkspaceAsset(data: CreateWorkspaceAssetInput, handoffId: string) {
  return db.transaction(async tx => {
    const [scope] = await tx.select({ accountId: equipeBrandHandoffs.accountId }).from(equipeBrandHandoffs)
      .where(and(eq(equipeBrandHandoffs.workspaceId, data.workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
    if (!scope) return null;
    // Same account lock as "É isso": the upload is either visible to confirmation,
    // or rejected after confirmation commits. No late provisional row can survive.
    const [account] = await tx.select({ id: equipeAccounts.id }).from(equipeAccounts)
      .where(and(eq(equipeAccounts.workspaceId, data.workspaceId), eq(equipeAccounts.id, scope.accountId)))
      .for("no key update");
    if (!account) return null;
    const [handoff] = await tx.select().from(equipeBrandHandoffs)
      .where(and(eq(equipeBrandHandoffs.workspaceId, data.workspaceId), eq(equipeBrandHandoffs.id, handoffId))).limit(1);
    if (!handoff || handoff.step === "done") return null;
    return createWorkspaceAsset({ ...data, clientProfileId: null, source: "brand_upload",
      metadata: { ...data.metadata, handoffId, readingId: handoff.readingId, provisional: true },
    }, tx);
  });
}

export async function isHandoffInWorkspace(workspaceId: string, handoffId: string) {
  return Boolean(await getHandoffAssetScope(workspaceId, handoffId));
}
