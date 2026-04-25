import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { campaigns } from "../db/schema";

export type CampaignStatus = "draft" | "active" | "generating" | "completed" | "failed";

export interface CreateCampaignInput {
  name: string;
  client?: string;
  product?: string;
  objective?: string;
  audience?: string;
  platforms?: string[];
  tone?: string;
  offer?: string;
  constraints?: string;
  notes?: string;
  status?: CampaignStatus;
}

export interface UpdateCampaignInput {
  name?: string;
  client?: string;
  product?: string;
  objective?: string;
  audience?: string;
  platforms?: string[];
  tone?: string;
  offer?: string;
  constraints?: string;
  notes?: string;
  status?: CampaignStatus;
}

export async function createCampaign(
  workspaceId: string,
  data: CreateCampaignInput
) {
  const result = await db
    .insert(campaigns)
    .values({
      workspaceId,
      name: data.name,
      client: data.client ?? null,
      product: data.product ?? null,
      objective: data.objective ?? null,
      audience: data.audience ?? null,
      platforms: data.platforms ?? [],
      tone: data.tone ?? null,
      offer: data.offer ?? null,
      constraints: data.constraints ?? null,
      notes: data.notes ?? null,
      status: data.status ?? "draft",
    })
    .returning();
  return result[0];
}

export async function getCampaigns(workspaceId: string) {
  return db
    .select()
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(desc(campaigns.updatedAt));
}

export async function getCampaignById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  return result[0] ?? null;
}

export async function updateCampaign(
  id: string,
  workspaceId: string,
  data: UpdateCampaignInput
) {
  const result = await db
    .update(campaigns)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .returning();
  return result[0] ?? null;
}

export async function deleteCampaign(id: string, workspaceId: string) {
  const result = await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .returning();
  return result[0] ?? null;
}
