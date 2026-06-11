import { eq, and, desc, asc, sql, ilike, inArray } from "drizzle-orm";
import { db } from "../db";
import { campaigns, derivations } from "../db/schema";

export type CampaignStatus =
  | "draft"
  | "active"
  | "generating"
  | "completed"
  | "failed";

export type GenerationMode = "art_variation" | "format_adaptation" | "restyling";

export type CreativeLevel = "conservative" | "balanced" | "bold" | "extreme";

export type StyleIntensity = "soft" | "medium" | "strong";

export type CampaignListSortOption =
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc"
  | "variations";

export interface CampaignListQuery {
  searchQuery?: string;
  statusFilter?: CampaignStatus | "all";
  platformFilter?: "Meta" | "TikTok" | "Google" | "all";
  sortOption?: CampaignListSortOption;
  limit?: number;
  offset?: number;
}

export interface CreativeDiagnosis {
  detectedConcept: string;
  elementsToPreserve: string[];
  variationOpportunities: string[];
}

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
  platformSpecificNotes?: Record<string, unknown> | null;
  notes?: string;
  status?: CampaignStatus;
  generationMode?: GenerationMode;
  ctaVariants?: string[];
  targetFormats?: string[];
  creativeLevel?: CreativeLevel;
  styleIntensity?: StyleIntensity;
  creativeDiagnosisStatus?: "pending" | "analyzing" | "ready" | "failed";
  creativeDiagnosis?: CreativeDiagnosis | null;
  creativeDiagnosisSource?: "ai" | "edited" | "regenerated" | null;
  creativeDiagnosisUpdatedAt?: Date | null;
  clientProfileId?: string | null;
  selectedReferenceIds?: string[] | null;
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
  platformSpecificNotes?: Record<string, unknown> | null;
  notes?: string;
  status?: CampaignStatus;
  generationMode?: GenerationMode;
  ctaVariants?: string[];
  targetFormats?: string[];
  creativeLevel?: CreativeLevel;
  styleIntensity?: StyleIntensity;
  creativeDiagnosisStatus?: "pending" | "analyzing" | "ready" | "failed";
  creativeDiagnosis?: CreativeDiagnosis | null;
  creativeDiagnosisSource?: "ai" | "edited" | "regenerated" | null;
  creativeDiagnosisUpdatedAt?: Date | null;
  clientProfileId?: string | null;
  selectedReferenceIds?: string[] | null;
}

export interface CampaignMetrics {
  variations: number;
  creditsUsed: number;
  totalDerivations: number;
  activeDerivations: number;
  failedDerivations: number;
  completedDerivations: number;
  previewPendingBatch: boolean;
}

type CampaignRow = typeof campaigns.$inferSelect;
type CampaignWithMetrics = CampaignRow & CampaignMetrics;
type CampaignMetricsRow = CampaignMetrics & { campaignId: string };

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
  platformSpecificNotes: campaigns.platformSpecificNotes,
  clientProfileId: campaigns.clientProfileId,
  selectedReferenceIds: campaigns.selectedReferenceIds,
  notes: campaigns.notes,
  generationMode: campaigns.generationMode,
  ctaVariants: campaigns.ctaVariants,
  targetFormats: campaigns.targetFormats,
  status: campaigns.status,
  creativeLevel: campaigns.creativeLevel,
  styleIntensity: campaigns.styleIntensity,
  creativeDiagnosisStatus: campaigns.creativeDiagnosisStatus,
  creativeDiagnosis: campaigns.creativeDiagnosis,
  creativeDiagnosisSource: campaigns.creativeDiagnosisSource,
  creativeDiagnosisUpdatedAt: campaigns.creativeDiagnosisUpdatedAt,
  campaignMemory: campaigns.campaignMemory,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

const emptyCampaignMetrics: CampaignMetrics = {
  variations: 0,
  creditsUsed: 0,
  totalDerivations: 0,
  activeDerivations: 0,
  failedDerivations: 0,
  completedDerivations: 0,
  previewPendingBatch: false,
};

const previewPendingBatchSql = sql<boolean>`(
  count(*) filter (
    where ${derivations.isPreview} = true
      and ${derivations.status} = 'approved'
  ) > 0
  and count(*) filter (
    where ${derivations.isPreview} = false
      and ${derivations.status} in ('queued', 'processing', 'completed', 'approved')
  ) = 0
)`.as("previewPendingBatch");

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

function buildCampaignMetricsRow(row: Partial<CampaignMetricsRow> | undefined): CampaignMetricsRow {
  return {
    campaignId: row?.campaignId ?? "",
    variations: toNumber(row?.variations),
    creditsUsed: toNumber(row?.creditsUsed),
    totalDerivations: toNumber(row?.totalDerivations),
    activeDerivations: toNumber(row?.activeDerivations),
    failedDerivations: toNumber(row?.failedDerivations),
    completedDerivations: toNumber(row?.completedDerivations),
    previewPendingBatch: Boolean(row?.previewPendingBatch),
  };
}

async function getCampaignMetrics(workspaceId: string, campaignIds?: string[]) {
  if (campaignIds?.length === 0) {
    return new Map<string, CampaignMetricsRow>();
  }

  const whereClause = campaignIds?.length
    ? and(eq(derivations.workspaceId, workspaceId), inArray(derivations.campaignId, campaignIds))
    : eq(derivations.workspaceId, workspaceId);

  const rows = await db
    .select({
      campaignId: derivations.campaignId,
      variations: sql<number>`count(*) filter (
        where ${derivations.status} in ('completed', 'approved', 'rejected')
          and ${derivations.outputKey} is not null
      )::int`.as("variations"),
      creditsUsed: sql<number>`coalesce(sum(
        case
          when ${derivations.status} in ('completed', 'approved', 'rejected')
          then coalesce(${derivations.cost}, 0)
          else 0
        end
      ), 0)::int`.as("creditsUsed"),
      totalDerivations: sql<number>`count(*)::int`.as("totalDerivations"),
      activeDerivations: sql<number>`count(*) filter (
        where ${derivations.status} in ('queued', 'processing')
      )::int`.as("activeDerivations"),
      failedDerivations: sql<number>`count(*) filter (
        where ${derivations.status} = 'failed'
      )::int`.as("failedDerivations"),
      completedDerivations: sql<number>`count(*) filter (
        where ${derivations.status} in ('completed', 'approved', 'rejected')
          and ${derivations.outputKey} is not null
      )::int`.as("completedDerivations"),
      previewPendingBatch: previewPendingBatchSql,
    })
    .from(derivations)
    .where(whereClause)
    .groupBy(derivations.campaignId);

  return new Map(rows.map((row) => [row.campaignId, buildCampaignMetricsRow(row)]));
}

function mergeCampaignMetrics<T extends CampaignRow>(
  row: T,
  metrics?: CampaignMetricsRow
) {
  const campaignMetrics: Partial<CampaignMetricsRow> = metrics ? { ...metrics } : {};
  delete campaignMetrics.campaignId;
  return withDerivedStatus({
    ...row,
    ...emptyCampaignMetrics,
    ...campaignMetrics,
  });
}

function buildCampaignListConditions(workspaceId: string, query: CampaignListQuery) {
  const conditions = [eq(campaigns.workspaceId, workspaceId)];

  const trimmedSearchQuery = query.searchQuery?.trim();
  if (trimmedSearchQuery) {
    const pattern = `%${trimmedSearchQuery}%`;
    conditions.push(ilike(campaigns.name, pattern));
  }

  if (query.statusFilter && query.statusFilter !== "all") {
    conditions.push(eq(campaigns.status, query.statusFilter));
  }

  return conditions;
}

function buildCampaignListOrder(sortOption: CampaignListSortOption | undefined) {
  switch (sortOption ?? "newest") {
    case "oldest":
      return [asc(campaigns.updatedAt), asc(campaigns.id)];
    case "name-asc":
      return [asc(campaigns.name), asc(campaigns.id)];
    case "name-desc":
      return [desc(campaigns.name), asc(campaigns.id)];
    case "newest":
    default:
      return [desc(campaigns.updatedAt), asc(campaigns.id)];
  }
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
      platformSpecificNotes: data.platformSpecificNotes ?? null,
      notes: data.notes ?? null,
      generationMode: data.generationMode ?? "art_variation",
      ctaVariants: data.ctaVariants ?? null,
      targetFormats: data.targetFormats ?? null,
      creativeLevel: data.creativeLevel ?? "balanced",
      styleIntensity: data.styleIntensity ?? "medium",
      creativeDiagnosisStatus: data.creativeDiagnosisStatus ?? "pending",
      creativeDiagnosis: data.creativeDiagnosis ?? null,
      creativeDiagnosisSource: data.creativeDiagnosisSource ?? null,
      clientProfileId: data.clientProfileId ?? null,
      selectedReferenceIds: data.selectedReferenceIds ?? null,
      status: data.status ?? "draft",
    })
    .returning();
  return result[0];
}

export async function getWorkspaceCampaignCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`.as("count") })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId));
  return row?.count ?? 0;
}

export async function getCampaignPeriodCounts(
  workspaceId: string,
  periodStart: Date,
  previousPeriodStart: Date
) {
  const [row] = await db
    .select({
      thisPeriod: sql<number>`count(*) filter (where ${campaigns.createdAt} >= ${periodStart})::int`.as(
        "thisPeriod"
      ),
      previousPeriod: sql<number>`count(*) filter (
        where ${campaigns.createdAt} >= ${previousPeriodStart}
          and ${campaigns.createdAt} < ${periodStart}
      )::int`.as("previousPeriod"),
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId));

  return {
    thisPeriod: row?.thisPeriod ?? 0,
    previousPeriod: row?.previousPeriod ?? 0,
  };
}

export async function getCampaigns(workspaceId: string, limit = 50) {
  const rows = await db
    .select({
      ...campaignFields,
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, workspaceId))
    .orderBy(desc(campaigns.updatedAt))
    .limit(limit);

  const metricsByCampaignId = await getCampaignMetrics(
    workspaceId,
    rows.map((row) => row.id)
  );
  return rows.map((row) => mergeCampaignMetrics(row, metricsByCampaignId.get(row.id)));
}

export async function getCampaignsPage(
  workspaceId: string,
  query: CampaignListQuery = {}
) {
  const conditions = buildCampaignListConditions(workspaceId, query);
  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
  const totalRows = await db
    .select({ count: sql<number>`count(*)::int`.as("count") })
    .from(campaigns)
    .where(whereClause);

  const metrics = db
    .select({
      campaignId: derivations.campaignId,
      variations: sql<number>`count(*) filter (
        where ${derivations.status} in ('completed', 'approved', 'rejected')
          and ${derivations.outputKey} is not null
      )::int`.as("variations"),
      creditsUsed: sql<number>`coalesce(sum(
        case
          when ${derivations.status} in ('completed', 'approved', 'rejected')
          then coalesce(${derivations.cost}, 0)
          else 0
        end
      ), 0)::int`.as("creditsUsed"),
      totalDerivations: sql<number>`count(*)::int`.as("totalDerivations"),
      activeDerivations: sql<number>`count(*) filter (
        where ${derivations.status} in ('queued', 'processing')
      )::int`.as("activeDerivations"),
      failedDerivations: sql<number>`count(*) filter (
        where ${derivations.status} = 'failed'
      )::int`.as("failedDerivations"),
      completedDerivations: sql<number>`count(*) filter (
        where ${derivations.status} in ('completed', 'approved', 'rejected')
          and ${derivations.outputKey} is not null
      )::int`.as("completedDerivations"),
      previewPendingBatch: previewPendingBatchSql,
    })
    .from(derivations)
    .where(eq(derivations.workspaceId, workspaceId))
    .groupBy(derivations.campaignId)
    .as("campaign_metrics");

  const orderBy =
    query.sortOption === "variations"
      ? [desc(sql<number>`coalesce(${metrics.variations}, 0)`), desc(campaigns.updatedAt), asc(campaigns.id)]
      : buildCampaignListOrder(query.sortOption);

  const queryBuilder = db
    .select({
      ...campaignFields,
      variations: sql<number>`coalesce(${metrics.variations}, 0)::int`.as("variations"),
      creditsUsed: sql<number>`coalesce(${metrics.creditsUsed}, 0)::int`.as("creditsUsed"),
      totalDerivations: sql<number>`coalesce(${metrics.totalDerivations}, 0)::int`.as("totalDerivations"),
      activeDerivations: sql<number>`coalesce(${metrics.activeDerivations}, 0)::int`.as("activeDerivations"),
      failedDerivations: sql<number>`coalesce(${metrics.failedDerivations}, 0)::int`.as("failedDerivations"),
      completedDerivations: sql<number>`coalesce(${metrics.completedDerivations}, 0)::int`.as("completedDerivations"),
      previewPendingBatch: sql<boolean>`coalesce(${metrics.previewPendingBatch}, false)`.as(
        "previewPendingBatch"
      ),
    })
    .from(campaigns)
    .leftJoin(metrics, eq(metrics.campaignId, campaigns.id))
    .where(whereClause)
    .orderBy(...orderBy);

  const limitedQuery =
    typeof query.limit === "number" ? queryBuilder.limit(query.limit) : queryBuilder;
  const pagedQuery =
    typeof query.offset === "number" && query.offset > 0
      ? limitedQuery.offset(query.offset)
      : limitedQuery;

  const rows = await pagedQuery;
  return {
    campaigns: rows.map(withDerivedStatus),
    totalCount: totalRows[0]?.count ?? 0,
  };
}

export async function getCampaignById(id: string, workspaceId: string) {
  const [metricsByCampaignId, result] = await Promise.all([
    getCampaignMetrics(workspaceId, [id]),
    db
      .select({
        ...campaignFields,
      })
      .from(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
      .limit(1),
  ]);
  return result[0]
    ? mergeCampaignMetrics(result[0], metricsByCampaignId.get(result[0].id))
    : null;
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
    platformSpecificNotes,
    notes,
    generationMode,
    ctaVariants,
    targetFormats,
    creativeLevel,
    styleIntensity,
    creativeDiagnosisStatus,
    creativeDiagnosis,
    creativeDiagnosisSource,
    creativeDiagnosisUpdatedAt,
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
      ...(platformSpecificNotes !== undefined && { platformSpecificNotes }),
      ...(notes !== undefined && { notes }),
      ...(generationMode !== undefined && { generationMode }),
      ...(ctaVariants !== undefined && { ctaVariants }),
      ...(targetFormats !== undefined && { targetFormats }),
      ...(creativeLevel !== undefined && { creativeLevel }),
      ...(styleIntensity !== undefined && { styleIntensity }),
      ...(creativeDiagnosisStatus !== undefined && { creativeDiagnosisStatus }),
      ...(creativeDiagnosis !== undefined && { creativeDiagnosis }),
      ...(creativeDiagnosisSource !== undefined && { creativeDiagnosisSource }),
      ...(creativeDiagnosisUpdatedAt !== undefined && { creativeDiagnosisUpdatedAt }),
      ...(status !== undefined && { status }),
      ...(data.clientProfileId !== undefined && { clientProfileId: data.clientProfileId }),
      ...(data.selectedReferenceIds !== undefined && { selectedReferenceIds: data.selectedReferenceIds }),
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
