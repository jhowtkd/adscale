import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, derivations } from "../db/schema";

export type CampaignStatus =
  | "draft"
  | "active"
  | "generating"
  | "completed"
  | "failed";

export type GenerationMode = "art_variation" | "format_adaptation";

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
  generationMode?: GenerationMode;
  ctaVariants?: string[];
  targetFormats?: string[];
  creativeLevel?: string;
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
  generationMode?: GenerationMode;
  ctaVariants?: string[];
  targetFormats?: string[];
  creativeLevel?: string;
}

export interface CampaignMetrics {
  variations: number;
  creditsUsed: number;
  totalDerivations: number;
  activeDerivations: number;
  failedDerivations: number;
  completedDerivations: number;
}

type CampaignRow = typeof campaigns.$inferSelect;
type CampaignWithMetrics = CampaignRow & CampaignMetrics;

const campaignFields = {
  id: campaigns.id,
  workspaceId: campaigns.workspaceId,
  name: campaigns.name,
  client: campaigns.client,
  product: campaigns.product,
  objective: campaigns.objective,
  audience: campaigns.audience,
  platforms: campaigns.platforms,
  tone: campaigns.tone,
  offer: campaigns.offer,
  constraints: campaigns.constraints,
  notes: campaigns.notes,
  generationMode: campaigns.generationMode,
  ctaVariants: campaigns.ctaVariants,
  targetFormats: campaigns.targetFormats,
  status: campaigns.status,
  creativeLevel: campaigns.creativeLevel,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function withDerivedStatus<T extends Partial<CampaignWithMetrics>>(row: T): T {
  if (!("totalDerivations" in row)) {
    return row;
  }

  const activeDerivations = toNumber(row.activeDerivations);
  const failedDerivations = toNumber(row.failedDerivations);
  const completedDerivations = toNumber(row.completedDerivations);
  const totalDerivations = toNumber(row.totalDerivations);

  let status = row.status ?? "draft";
  if (activeDerivations > 0) {
    status = "generating";
  } else if (totalDerivations > 0 && completedDerivations + failedDerivations >= totalDerivations) {
    status = completedDerivations > 0 ? "completed" : "failed";
  }

  return {
    ...row,
    status,
    variations: toNumber(row.variations),
    creditsUsed: toNumber(row.creditsUsed),
    totalDerivations,
    activeDerivations,
    failedDerivations,
    completedDerivations,
  } as T;
}

function metricsSelect(workspaceId: string) {
  return {
    variations: sql<number>`(
      select count(*)::int
      from ${derivations}
      where ${derivations.campaignId} = ${campaigns.id}
        and ${derivations.workspaceId} = ${workspaceId}
        and ${derivations.status} in ('completed', 'approved', 'rejected')
        and ${derivations.outputKey} is not null
    )`,
    creditsUsed: sql<number>`(
      select coalesce(sum(coalesce(${derivations.cost}, 0)), 0)::int
      from ${derivations}
      where ${derivations.campaignId} = ${campaigns.id}
        and ${derivations.workspaceId} = ${workspaceId}
        and ${derivations.status} in ('completed', 'approved', 'rejected')
    )`,
    totalDerivations: sql<number>`(
      select count(*)::int
      from ${derivations}
      where ${derivations.campaignId} = ${campaigns.id}
        and ${derivations.workspaceId} = ${workspaceId}
    )`,
    activeDerivations: sql<number>`(
      select count(*)::int
      from ${derivations}
      where ${derivations.campaignId} = ${campaigns.id}
        and ${derivations.workspaceId} = ${workspaceId}
        and ${derivations.status} in ('queued', 'processing')
    )`,
    failedDerivations: sql<number>`(
      select count(*)::int
      from ${derivations}
      where ${derivations.campaignId} = ${campaigns.id}
        and ${derivations.workspaceId} = ${workspaceId}
        and ${derivations.status} = 'failed'
    )`,
    completedDerivations: sql<number>`(
      select count(*)::int
      from ${derivations}
      where ${derivations.campaignId} = ${campaigns.id}
        and ${derivations.workspaceId} = ${workspaceId}
        and ${derivations.status} in ('completed', 'approved', 'rejected')
        and ${derivations.outputKey} is not null
    )`,
  };
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
      generationMode: data.generationMode ?? "art_variation",
      ctaVariants: data.ctaVariants ?? null,
      targetFormats: data.targetFormats ?? null,
      creativeLevel: data.creativeLevel ?? "balanced",
      status: data.status ?? "draft",
    })
    .returning();
  return result[0];
}

export async function getCampaigns(workspaceId: string) {
  const rows = await db
    .select({
      ...campaignFields,
      ...metricsSelect(workspaceId),
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(desc(campaigns.updatedAt));
  return rows.map(withDerivedStatus);
}

export async function getCampaignById(id: string, workspaceId: string) {
  const result = await db
    .select({
      ...campaignFields,
      ...metricsSelect(workspaceId),
    })
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  return result[0] ? withDerivedStatus(result[0]) : null;
}

export async function updateCampaign(
  id: string,
  workspaceId: string,
  data: UpdateCampaignInput
) {
  const {
    name,
    client,
    product,
    objective,
    audience,
    platforms,
    tone,
    offer,
    constraints,
    notes,
    generationMode,
    ctaVariants,
    targetFormats,
    creativeLevel,
    status,
  } = data;
  const result = await db
    .update(campaigns)
    .set({
      ...(name !== undefined && { name }),
      ...(client !== undefined && { client }),
      ...(product !== undefined && { product }),
      ...(objective !== undefined && { objective }),
      ...(audience !== undefined && { audience }),
      ...(platforms !== undefined && { platforms }),
      ...(tone !== undefined && { tone }),
      ...(offer !== undefined && { offer }),
      ...(constraints !== undefined && { constraints }),
      ...(notes !== undefined && { notes }),
      ...(generationMode !== undefined && { generationMode }),
      ...(ctaVariants !== undefined && { ctaVariants }),
      ...(targetFormats !== undefined && { targetFormats }),
      ...(creativeLevel !== undefined && { creativeLevel }),
      ...(status !== undefined && { status }),
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

export async function refreshCampaignStatus(
  campaignId: string,
  workspaceId: string
) {
  const campaign = await getCampaignById(campaignId, workspaceId);
  if (!campaign) return null;

  await db
    .update(campaigns)
    .set({
      status: campaign.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.workspaceId, workspaceId)
      )
    );

  return campaign.status;
}
