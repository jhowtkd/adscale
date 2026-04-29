import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";

export interface CreateDerivationInput {
  campaignId: string;
  workspaceId: string;
  planId?: string;
  parentId?: string;
  status?: string;
  feedback?: string;
  format?: string;
  generationMode?: string;
  variantIndex?: number;
  ctaText?: string;
}

export async function createDerivation(data: CreateDerivationInput) {
  const result = await db
    .insert(derivations)
    .values({
      campaignId: data.campaignId,
      workspaceId: data.workspaceId,
      planId: data.planId ?? null,
      parentId: data.parentId ?? null,
      status: data.status ?? "queued",
      feedback: data.feedback ?? null,
      format: data.format ?? null,
      generationMode: data.generationMode ?? null,
      variantIndex: data.variantIndex ?? null,
      ctaText: data.ctaText ?? null,
    })
    .returning();
  return result[0];
}

export async function getDerivationsByCampaign(
  campaignId: string,
  workspaceId: string
) {
  return db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.campaignId, campaignId),
        eq(derivations.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(derivations.createdAt));
}

export async function updateDerivationStatus(
  id: string,
  workspaceId: string,
  status: string,
  outputKey?: string
) {
  const result = await db
    .update(derivations)
    .set({
      status,
      ...(outputKey !== undefined && { outputKey }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(derivations.id, id),
        eq(derivations.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function getDerivationById(id: string, workspaceId: string) {
  const result = await db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.id, id),
        eq(derivations.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function getApprovedDerivationsByCampaign(
  campaignId: string,
  workspaceId: string
) {
  return db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.campaignId, campaignId),
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.status, "approved")
      )
    )
    .orderBy(desc(derivations.createdAt));
}
