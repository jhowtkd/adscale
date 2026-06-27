import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { creativePlans } from "../db/schema";

export interface CreatePlanInput {
  strategy: string;
  angles: string[];
  hooks: string[];
  ctas: string[];
}

export async function createPlan(
  campaignId: string,
  workspaceId: string,
  data: CreatePlanInput
) {
  const result = await db
    .insert(creativePlans)
    .values({
      campaignId,
      workspaceId,
      strategy: data.strategy,
      angles: data.angles,
      hooks: data.hooks,
      ctas: data.ctas,
      status: "draft",
    })
    .returning();
  return result[0];
}

export async function getPlanByCampaign(
  campaignId: string,
  workspaceId: string
) {
  const result = await db
    .select()
    .from(creativePlans)
    .where(
      and(
        eq(creativePlans.campaignId, campaignId),
        eq(creativePlans.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getPlanById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(creativePlans)
    .where(
      and(eq(creativePlans.id, id), eq(creativePlans.workspaceId, workspaceId))
    )
    .limit(1);
  return result[0] ?? null;
}

export async function updatePlanStatus(
  id: string,
  workspaceId: string,
  status: string
) {
  const result = await db
    .update(creativePlans)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(creativePlans.id, id),
        eq(creativePlans.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}
