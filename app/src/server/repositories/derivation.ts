import { eq, and, desc, inArray, sql, isNotNull, ne } from "drizzle-orm";
import type {
  CreativeHardFailure,
  CreativeQualityVerdict,
} from "../ai/creative-quality-gate";
import type {
  ExportStatusPayload,
  OlharVerdictPayload,
} from "../ai/olhar/dual-verdict";
import type { DerivationGenerationLog } from "../ai/generation-log";
import type { CreativeContract, PromptProvenance } from "../ai/creative-contract";
import type { RegenerationCorrectionBriefRecord } from "../ai/regeneration-correction-brief";
import type { OutputLearningApplicationSnapshot } from "../human-quality/corpus";
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

export interface UpdateDerivationQualityGateInput {
  qualityVerdict: CreativeQualityVerdict;
  hardFailures: CreativeHardFailure[];
  polishSuggestions: string[];
  qualityGatedAt: Date;
}

export interface UpdateDerivationDualVerdictInput {
  olharVerdict?: OlharVerdictPayload | null;
  exportStatus?: ExportStatusPayload | null;
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
  styleAssetId?: string;
  isPreview?: boolean;
  creativeContract?: CreativeContract;
  regenerationCorrectionBrief?: RegenerationCorrectionBriefRecord;
  outputLearningApplication?: OutputLearningApplicationSnapshot | null;
  /**
   * Per-derivation creative intensity. When set, the generation pipeline uses
   * this instead of the campaign's creativeLevel so a controlled triplet can
   * vary only intensity (conservative/balanced/bold) while keeping every other
   * prompt input identical.
   */
  creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
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
      styleAssetId: data.styleAssetId ?? null,
      isPreview: data.isPreview ?? false,
      creativeContract: data.creativeContract ?? null,
      regenerationCorrectionBrief: data.regenerationCorrectionBrief ?? null,
      outputLearningApplication: data.outputLearningApplication ?? null,
      creativeLevel: data.creativeLevel ?? null,
    })
    .returning();
  return result[0];
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createPackageChildIfAbsent(
  data: CreateDerivationInput & { parentId: string; format: string },
  tx?: DbOrTx
) {
  const run = async (client: DbOrTx) => {
    await client
      .select({ id: derivations.id })
      .from(derivations)
      .where(
        and(
          eq(derivations.id, data.parentId),
          eq(derivations.workspaceId, data.workspaceId)
        )
      )
      .for("update");

    const active = await client
      .select()
      .from(derivations)
      .where(
        and(
          eq(derivations.parentId, data.parentId),
          eq(derivations.workspaceId, data.workspaceId),
          eq(derivations.generationMode, "format_adaptation"),
          eq(derivations.format, data.format),
          inArray(derivations.status, ["queued", "processing"])
        )
      )
      .limit(1);

    if (active[0]) {
      return { child: active[0], created: false as const };
    }

    const [child] = await client
      .insert(derivations)
      .values({
        campaignId: data.campaignId,
        workspaceId: data.workspaceId,
        planId: data.planId ?? null,
        parentId: data.parentId,
        status: data.status ?? "queued",
        feedback: data.feedback ?? null,
        format: data.format,
        generationMode: data.generationMode ?? "format_adaptation",
        variantIndex: data.variantIndex ?? null,
        ctaText: data.ctaText ?? null,
        styleAssetId: data.styleAssetId ?? null,
        isPreview: data.isPreview ?? false,
        creativeContract: data.creativeContract ?? null,
        regenerationCorrectionBrief: data.regenerationCorrectionBrief ?? null,
        outputLearningApplication: data.outputLearningApplication ?? null,
      })
      .returning();

    return { child, created: true as const };
  };

  if (tx) {
    return run(tx);
  }

  return db.transaction(run);
}

export async function deleteQueuedDerivation(
  id: string,
  workspaceId: string,
): Promise<void> {
  await db.delete(derivations).where(and(
    eq(derivations.id, id),
    eq(derivations.workspaceId, workspaceId),
    eq(derivations.status, "queued"),
  ));
}

export async function failQueuedDerivation(
  id: string,
  workspaceId: string,
): Promise<typeof derivations.$inferSelect | null> {
  const [row] = await db
    .update(derivations)
    .set({ status: "failed", updatedAt: new Date() })
    .where(and(
      eq(derivations.id, id),
      eq(derivations.workspaceId, workspaceId),
      eq(derivations.status, "queued"),
    ))
    .returning();
  return row ?? null;
}

export async function getLatestFormatAdaptationChild(input: {
  workspaceId: string;
  parentId: string;
  format: string;
  excludeId?: string;
}) {
  const [child] = await db
    .select()
    .from(derivations)
    .where(and(
      eq(derivations.workspaceId, input.workspaceId),
      eq(derivations.parentId, input.parentId),
      eq(derivations.generationMode, "format_adaptation"),
      eq(derivations.format, input.format),
      input.excludeId ? ne(derivations.id, input.excludeId) : undefined,
    ))
    .orderBy(desc(derivations.createdAt))
    .limit(1);
  return child ?? null;
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

export async function getDerivationsByCampaigns(
  campaignIds: string[],
  workspaceId: string
) {
  if (campaignIds.length === 0) return [];
  return db
    .select()
    .from(derivations)
    .where(
      and(
        inArray(derivations.campaignId, campaignIds),
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

/** Mark processing with composite workspace scope (Phase 3 / Gate 3). */
export async function setDerivationProcessing(
  id: string,
  workspaceId: string
) {
  return updateDerivationStatus(id, workspaceId, "processing");
}

export async function completeDerivation(
  id: string,
  workspaceId: string,
  data: {
    outputKey: string;
    prompt: string | null;
    candidates?: typeof derivations.$inferInsert.candidates;
  }
) {
  const result = await db
    .update(derivations)
    .set({
      status: "completed",
      outputKey: data.outputKey,
      prompt: data.prompt,
      ...(data.candidates !== undefined ? { candidates: data.candidates } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(derivations.id, id), eq(derivations.workspaceId, workspaceId))
    )
    .returning();
  return result[0] ?? null;
}

export async function failDerivation(
  id: string,
  workspaceId: string,
  userMessage: string
) {
  const result = await db
    .update(derivations)
    .set({
      status: "failed",
      prompt: userMessage,
      updatedAt: new Date(),
    })
    .where(
      and(eq(derivations.id, id), eq(derivations.workspaceId, workspaceId))
    )
    .returning();
  return result[0] ?? null;
}

export async function failStaleActiveDerivations(
  campaignId: string,
  workspaceId: string,
  staleMinutes: number
) {
  // Compare against the database clock instead of a JS `Date`. The column
  // default (`defaultNow()`) and the app's `new Date()` can disagree when the
  // Postgres session timezone differs from the Node process, which previously
  // made freshly-queued derivations look instantly stale. Using `now()` on both
  // sides keeps the stale window timezone-agnostic.
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
        sql`${derivations.updatedAt} < now() - (${staleMinutes}::int * interval '1 minute')`
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

/** True when the campaign already has queued/processing derivations. */
export async function campaignHasActiveDerivations(
  campaignId: string,
  workspaceId: string
): Promise<boolean> {
  const existingQueued = await db
    .select({ id: derivations.id })
    .from(derivations)
    .where(
      and(
        eq(derivations.campaignId, campaignId),
        eq(derivations.workspaceId, workspaceId),
        inArray(derivations.status, ["queued", "processing"])
      )
    )
    .limit(1);
  return existingQueued.length > 0;
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

export async function updateDerivationQualityGate(
  id: string,
  workspaceId: string,
  data: UpdateDerivationQualityGateInput
) {
  const result = await db
    .update(derivations)
    .set({
      qualityVerdict: data.qualityVerdict,
      hardFailures: data.hardFailures,
      polishSuggestions: data.polishSuggestions,
      qualityGatedAt: data.qualityGatedAt,
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

export async function updateDerivationDualVerdict(
  id: string,
  workspaceId: string,
  data: UpdateDerivationDualVerdictInput
) {
  const now = new Date();
  const result = await db
    .update(derivations)
    .set({
      ...(data.olharVerdict !== undefined && { olharVerdict: data.olharVerdict }),
      ...(data.exportStatus !== undefined && { exportStatus: data.exportStatus }),
      updatedAt: now,
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

export interface UpdateDerivationPromptProvenanceInput {
  creativeContract: CreativeContract;
  promptProvenance: PromptProvenance;
  inputPrompt?: string;
  prompt?: string;
}

export async function updateDerivationGenerationLog(
  id: string,
  workspaceId: string,
  generationLog: DerivationGenerationLog
) {
  const result = await db
    .update(derivations)
    .set({ generationLog, updatedAt: new Date() })
    .where(and(eq(derivations.id, id), eq(derivations.workspaceId, workspaceId)))
    .returning();
  return result[0] ?? null;
}

export async function updateDerivationPromptProvenance(
  id: string,
  workspaceId: string,
  data: UpdateDerivationPromptProvenanceInput
) {
  const now = new Date();
  const result = await db
    .update(derivations)
    .set({
      creativeContract: data.creativeContract,
      promptProvenance: data.promptProvenance,
      ...(data.inputPrompt !== undefined && { inputPrompt: data.inputPrompt }),
      ...(data.prompt !== undefined && { prompt: data.prompt }),
      updatedAt: now,
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

/** Latest completed derivation output key per campaign (for dashboard thumbnails). */
export async function getLatestDerivationOutputKeysByCampaignIds(
  workspaceId: string,
  campaignIds: string[]
): Promise<Map<string, string>> {
  if (campaignIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      campaignId: derivations.campaignId,
      outputKey: derivations.outputKey,
    })
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        inArray(derivations.campaignId, campaignIds),
        inArray(derivations.status, ["completed", "approved"]),
        isNotNull(derivations.outputKey)
      )
    )
    .orderBy(desc(derivations.updatedAt));

  const outputKeysByCampaign = new Map<string, string>();
  for (const row of rows) {
    if (!outputKeysByCampaign.has(row.campaignId) && row.outputKey) {
      outputKeysByCampaign.set(row.campaignId, row.outputKey);
    }
  }

  return outputKeysByCampaign;
}
