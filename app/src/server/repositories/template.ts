import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { campaignTemplates, campaigns } from "../db/schema";

export interface CreateTemplateInput {
  workspaceId: string;
  name: string;
  description?: string;
  campaignId: string;
}

export async function createTemplate(input: CreateTemplateInput) {
  // Fetch the source campaign
  const campaign = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, input.campaignId),
        eq(campaigns.workspaceId, input.workspaceId)
      )
    )
    .limit(1);

  if (!campaign[0]) {
    throw new Error("Campaign not found");
  }

  const source = campaign[0];

  // Generic template: copy briefing fields only. Do not copy clientProfileId
  // or selectedReferenceIds — the user picks brand/refs after materialization.
  const result = await db
    .insert(campaignTemplates)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description ?? null,
      client: source.client,
      product: source.product,
      objective: source.objective,
      audience: source.audience,
      platforms: source.platforms ?? [],
      tone: source.tone,
      offer: source.offer,
      constraints: source.constraints,
      notes: source.notes,
      generationMode: source.generationMode,
      creativeLevel: source.creativeLevel,
      styleIntensity: source.styleIntensity,
      ctaVariants: source.ctaVariants,
      targetFormats: source.targetFormats,
    })
    .returning();

  return result[0];
}

export async function getTemplates(workspaceId: string) {
  return db
    .select()
    .from(campaignTemplates)
    .where(eq(campaignTemplates.workspaceId, workspaceId))
    .orderBy(desc(campaignTemplates.updatedAt));
}

export async function getTemplateById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.id, id),
        eq(campaignTemplates.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function updateTemplate(
  id: string,
  workspaceId: string,
  data: { name?: string; description?: string }
) {
  const result = await db
    .update(campaignTemplates)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaignTemplates.id, id),
        eq(campaignTemplates.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function deleteTemplate(id: string, workspaceId: string) {
  const result = await db
    .delete(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.id, id),
        eq(campaignTemplates.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}
