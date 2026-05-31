import { eq, and, desc, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";

export type ScoreStatus = "pending" | "heuristic" | "analyzed" | "failed";

export interface CreativeScoreBreakdown {
  ctaClarity: number;
  textLegibility: number;
  briefMatch: number;
  visualQuality: number;
  formatFit: number;
  variationLevelFit: number;
  informationPreservation: number;
}

export interface UpdateDerivationScoreInput {
  qualityScore?: number | null;
  scoreStatus: ScoreStatus;
  scoreBreakdown?: CreativeScoreBreakdown | null;
  scoreIssues?: string[] | null;
  regenerationSuggestion?: string | null;
}

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
  isPreview?: boolean;
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
      isPreview: data.isPreview ?? false,
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

export async function failStaleActiveDerivations(
  campaignId: string,
  workspaceId: string,
  staleBefore: Date
) {
  return db
    .update(derivations)
    .set({
      status: "failed",
      prompt: "Generation worker did not pick up this job. Try again with the worker running.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(derivations.campaignId, campaignId),
        eq(derivations.workspaceId, workspaceId),
        inArray(derivations.status, ["queued", "processing"]),
        lt(derivations.updatedAt, staleBefore)
      )
    )
    .returning();
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

export async function getActivePackageChildren({
  parentId,
  workspaceId,
  formats,
}: {
  parentId: string;
  workspaceId: string;
  formats: string[];
}) {
  if (formats.length === 0) return [];

  return db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.parentId, parentId),
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.generationMode, "format_adaptation"),
        inArray(derivations.format, formats),
        inArray(derivations.status, ["queued", "processing"])
      )
    );
}

export async function getActiveChildrenByParent(
  parentId: string,
  workspaceId: string
) {
  return db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.parentId, parentId),
        eq(derivations.workspaceId, workspaceId),
        inArray(derivations.status, ["queued", "processing"])
      )
    );
}

export async function isWorkspaceDerivationOutputKey(
  workspaceId: string,
  assetKey: string
) {
  const result = await db
    .select({ id: derivations.id })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.outputKey, assetKey)
      )
    )
    .limit(1);
  return result.length > 0;
}

export async function updateDerivationScore(
  id: string,
  workspaceId: string,
  data: UpdateDerivationScoreInput
) {
  const result = await db
    .update(derivations)
    .set({
      qualityScore: data.qualityScore ?? null,
      scoreStatus: data.scoreStatus,
      scoreBreakdown: data.scoreBreakdown ?? null,
      scoreIssues: data.scoreIssues ?? null,
      regenerationSuggestion: data.regenerationSuggestion ?? null,
      scoredAt: new Date(),
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

export async function updateDerivationQa(
  id: string,
  workspaceId: string,
  qa: {
    qaStatus: string;
    qaChecklist: unknown;
    qaIssues: string[];
    qaSuggestions: string[];
  }
) {
  const now = new Date();
  const [updated] = await db
    .update(derivations)
    .set({
      qaStatus: qa.qaStatus,
      qaChecklist: qa.qaChecklist,
      qaIssues: qa.qaIssues,
      qaSuggestions: qa.qaSuggestions,
      qaAnalyzedAt: now,
      updatedAt: now,
    })
    .where(and(eq(derivations.id, id), eq(derivations.workspaceId, workspaceId)))
    .returning();
  return updated ?? null;
}

export async function getDerivationsByWorkspace(workspaceId: string) {
  return db
    .select()
    .from(derivations)
    .where(eq(derivations.workspaceId, workspaceId))
    .orderBy(desc(derivations.createdAt));
}

export interface DerivationDashboardAnalytics {
  totalDerivations: number;
  derivationsThisPeriod: number;
  derivationsPreviousPeriod: number;
  approvedDerivations: number;
  approvedThisPeriod: number;
  approvedPreviousPeriod: number;
  avgGenerationTimeSeconds: number;
}

export async function getDerivationDashboardAnalytics(
  workspaceId: string,
  periodStart: Date,
  previousPeriodStart: Date
): Promise<DerivationDashboardAnalytics> {
  const [row] = await db
    .select({
      totalDerivations: sql<number>`count(*)::int`.as("totalDerivations"),
      derivationsThisPeriod: sql<number>`count(*) filter (
        where ${derivations.createdAt} >= ${periodStart}
      )::int`.as("derivationsThisPeriod"),
      derivationsPreviousPeriod: sql<number>`count(*) filter (
        where ${derivations.createdAt} >= ${previousPeriodStart}
          and ${derivations.createdAt} < ${periodStart}
      )::int`.as("derivationsPreviousPeriod"),
      approvedDerivations: sql<number>`count(*) filter (
        where ${derivations.status} = 'approved'
      )::int`.as("approvedDerivations"),
      approvedThisPeriod: sql<number>`count(*) filter (
        where ${derivations.createdAt} >= ${periodStart}
          and ${derivations.status} = 'approved'
      )::int`.as("approvedThisPeriod"),
      approvedPreviousPeriod: sql<number>`count(*) filter (
        where ${derivations.createdAt} >= ${previousPeriodStart}
          and ${derivations.createdAt} < ${periodStart}
          and ${derivations.status} = 'approved'
      )::int`.as("approvedPreviousPeriod"),
      avgGenerationTimeSeconds: sql<number>`coalesce(
        round(avg(
          extract(epoch from (${derivations.updatedAt} - ${derivations.createdAt}))
        ) filter (
          where ${derivations.status} in ('completed', 'approved')
        ))::int,
        0
      )`.as("avgGenerationTimeSeconds"),
    })
    .from(derivations)
    .where(eq(derivations.workspaceId, workspaceId));

  return {
    totalDerivations: row?.totalDerivations ?? 0,
    derivationsThisPeriod: row?.derivationsThisPeriod ?? 0,
    derivationsPreviousPeriod: row?.derivationsPreviousPeriod ?? 0,
    approvedDerivations: row?.approvedDerivations ?? 0,
    approvedThisPeriod: row?.approvedThisPeriod ?? 0,
    approvedPreviousPeriod: row?.approvedPreviousPeriod ?? 0,
    avgGenerationTimeSeconds: row?.avgGenerationTimeSeconds ?? 0,
  };
}
