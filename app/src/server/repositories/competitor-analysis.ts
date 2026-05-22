import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { competitorAnalyses } from "../db/schema";

export interface CreateCompetitorAnalysisInput {
  name: string;
  platform?: string | null;
  website?: string | null;
  screenshots?: string[] | null;
  strengths?: unknown;
  weaknesses?: unknown;
  differentiators?: unknown;
  analysis?: unknown;
  campaignId?: string | null;
}

export interface UpdateCompetitorAnalysisInput {
  name?: string;
  platform?: string | null;
  website?: string | null;
  screenshots?: string[] | null;
  strengths?: unknown;
  weaknesses?: unknown;
  differentiators?: unknown;
  analysis?: unknown;
  analyzedAt?: Date | null;
}

export async function getCompetitorAnalysesByCampaign(
  campaignId: string,
  workspaceId: string
) {
  return db
    .select()
    .from(competitorAnalyses)
    .where(
      and(
        eq(competitorAnalyses.campaignId, campaignId),
        eq(competitorAnalyses.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(competitorAnalyses.createdAt));
}

export async function getCompetitorAnalysesByWorkspace(workspaceId: string) {
  return db
    .select()
    .from(competitorAnalyses)
    .where(eq(competitorAnalyses.workspaceId, workspaceId))
    .orderBy(desc(competitorAnalyses.createdAt));
}

export async function getCompetitorAnalysisById(
  id: string,
  workspaceId: string
) {
  const result = await db
    .select()
    .from(competitorAnalyses)
    .where(
      and(
        eq(competitorAnalyses.id, id),
        eq(competitorAnalyses.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function createCompetitorAnalysis(
  workspaceId: string,
  data: CreateCompetitorAnalysisInput
) {
  const result = await db
    .insert(competitorAnalyses)
    .values({
      workspaceId,
      campaignId: data.campaignId ?? null,
      name: data.name,
      platform: data.platform ?? null,
      website: data.website ?? null,
      screenshots: data.screenshots ?? null,
      strengths: data.strengths ?? null,
      weaknesses: data.weaknesses ?? null,
      differentiators: data.differentiators ?? null,
      analysis: data.analysis ?? null,
      analyzedAt: data.analysis ? new Date() : null,
    })
    .returning();
  return result[0];
}

export async function updateCompetitorAnalysis(
  id: string,
  workspaceId: string,
  data: UpdateCompetitorAnalysisInput
) {
  const result = await db
    .update(competitorAnalyses)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.screenshots !== undefined && { screenshots: data.screenshots }),
      ...(data.strengths !== undefined && { strengths: data.strengths }),
      ...(data.weaknesses !== undefined && { weaknesses: data.weaknesses }),
      ...(data.differentiators !== undefined && { differentiators: data.differentiators }),
      ...(data.analysis !== undefined && { analysis: data.analysis }),
      ...(data.analyzedAt !== undefined && { analyzedAt: data.analyzedAt }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(competitorAnalyses.id, id),
        eq(competitorAnalyses.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}

export async function deleteCompetitorAnalysis(
  id: string,
  workspaceId: string
) {
  const result = await db
    .delete(competitorAnalyses)
    .where(
      and(
        eq(competitorAnalyses.id, id),
        eq(competitorAnalyses.workspaceId, workspaceId)
      )
    )
    .returning();
  return result[0] ?? null;
}
