import { eq, and, asc, desc, inArray, lt, max, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkItems,
  creativeWorkOutputs,
  creativeWorkSources,
  workspaceAssets,
  campaignTemplates,
  type CreativeWorkItem,
  type CreativeWorkOutput,
  type CreativeWorkSource,
} from "../db/schema";
import {
  CREATIVE_LEVELS,
  resolveCreativeWorkStatus,
  type CreativeWorkStatus,
  type CreativeWorkIdentitySnapshot,
  type SocialPostBrief,
  type SocialPostCopy,
  type CreativeWorkFormat,
  type CreativeWorkIntent,
  type CreativeWorkSettings,
  type CreativeWorkInputSnapshot,
  type CreativeSourceStatus,
  type CreativeSourceUsage,
} from "../creative-work/contracts";
import { getClientProfile, resolveCampaignClientProfileId } from "./client-reference";
import { getCampaignById } from "./campaign";

export type { CreativeWorkFormat } from "../creative-work/contracts";

export type CreativeWorkToolKind = CreativeWorkIntent;

export interface CreateCreativeWorkInput {
  workspaceId: string;
  clientProfileId: string;
  createdByUserId: string;
  toolKind: CreativeWorkToolKind;
  brief: SocialPostBrief;
  format: CreativeWorkFormat;
}

export interface CompleteCreativeWorkOutputData {
  outputKey: string;
  cost: number;
  quality: Record<string, unknown> | null;
}

export async function createCreativeWork(
  input: CreateCreativeWorkInput
): Promise<CreativeWorkItem> {
  const [row] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      createdByUserId: input.createdByUserId,
      toolKind: input.toolKind,
      brief: input.brief,
      format: input.format,
      status: "draft",
      title: input.brief.theme,
      request: JSON.stringify(input.brief),
      settings: { targetFormats: [] },
    })
    .returning();
  return row;
}

export interface CreateCreativeWorkDraftInput {
  workspaceId: string;
  clientProfileId: string;
  createdByUserId: string;
  draftKey: string;
  intent: CreativeWorkIntent;
  title: string;
  request: string;
  format?: CreativeWorkFormat;
  settings?: CreativeWorkSettings;
  brief?: SocialPostBrief | null;
  campaignId?: string | null;
  inputSnapshot?: CreativeWorkInputSnapshot | null;
}

export async function createCreativeWorkDraft(input: CreateCreativeWorkDraftInput): Promise<CreativeWorkItem | null> {
  const profile = await getClientProfile(input.workspaceId, input.clientProfileId);
  if (!profile) return null;
  if (input.campaignId) {
    const campaign = await getCampaignById(input.campaignId, input.workspaceId);
    if (!campaign) return null;
    const campaignProfileId = await resolveCampaignClientProfileId(input.workspaceId, campaign);
    if (campaignProfileId && campaignProfileId !== input.clientProfileId) return null;
  }
  const [created] = await db.insert(creativeWorkItems).values({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    createdByUserId: input.createdByUserId,
    draftKey: input.draftKey,
    toolKind: input.intent,
    title: input.title,
    request: input.request,
    format: input.format ?? "4:5",
    settings: input.settings ?? { targetFormats: [] },
    brief: input.brief ?? null,
    campaignId: input.campaignId ?? null,
    inputSnapshot: input.inputSnapshot ?? null,
    status: "draft",
  }).onConflictDoNothing().returning();
  if (created) return created;

  const [existing] = await db.select().from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, input.workspaceId),
    eq(creativeWorkItems.createdByUserId, input.createdByUserId),
    eq(creativeWorkItems.draftKey, input.draftKey),
  )).limit(1);
  if (!existing) throw new Error("creative_work_draft_conflict_without_row");
  return existing;
}

export type CreativeWorkDraftPatch = Partial<{
  toolKind: CreativeWorkIntent;
  title: string;
  request: string;
  format: CreativeWorkFormat;
  settings: CreativeWorkSettings;
  inputSnapshot: CreativeWorkInputSnapshot | null;
  brief: SocialPostBrief | null;
  copy: SocialPostCopy | null;
}>;

export async function updateCreativeWorkDraft(workspaceId: string, workItemId: string, patch: CreativeWorkDraftPatch): Promise<CreativeWorkItem | null> {
  const [row] = await db.update(creativeWorkItems).set({ ...patch, updatedAt: new Date() }).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
    eq(creativeWorkItems.status, "draft"),
  )).returning();
  return row ?? null;
}

export async function getCreativeWork(
  workspaceId: string,
  workItemId: string
): Promise<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[]; sources: CreativeWorkSource[] } | null> {
  const workRows = await db
    .select()
    .from(creativeWorkItems)
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .orderBy(asc(creativeWorkItems.createdAt))
    .limit(1);

  if (workRows.length === 0) {
    return null;
  }

  const outputs = await db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    )
    .orderBy(asc(creativeWorkOutputs.targetFormat), asc(creativeWorkOutputs.creativeLevel), asc(creativeWorkOutputs.versionNumber));

  const sources = await db.select().from(creativeWorkSources).where(and(
    eq(creativeWorkSources.workspaceId, workspaceId),
    eq(creativeWorkSources.workItemId, workItemId),
  )).orderBy(asc(creativeWorkSources.createdAt));

  return { work: workRows[0], outputs, sources };
}

export interface CreateCreativeWorkSourceInput {
  workspaceId: string;
  workItemId: string;
  assetId?: string | null;
  templateId?: string | null;
  usage: CreativeSourceUsage;
  status: CreativeSourceStatus;
  contentAnalysis?: CreativeWorkSource["contentAnalysis"];
  styleAnalysis?: CreativeWorkSource["styleAnalysis"];
  failureCode?: string | null;
}

export async function createCreativeWorkSource(input: CreateCreativeWorkSourceInput): Promise<CreativeWorkSource | null> {
  if (Boolean(input.assetId) === Boolean(input.templateId)) return null;
  const [work] = await db.select({ id: creativeWorkItems.id }).from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, input.workspaceId),
    eq(creativeWorkItems.id, input.workItemId),
  )).limit(1);
  if (!work) return null;
  const originTable = input.assetId ? workspaceAssets : campaignTemplates;
  const originId = input.assetId ?? input.templateId!;
  const [origin] = await db.select({ id: originTable.id }).from(originTable).where(and(
    eq(originTable.workspaceId, input.workspaceId),
    eq(originTable.id, originId),
  )).limit(1);
  if (!origin) return null;
  const [row] = await db.insert(creativeWorkSources).values(input).returning();
  return row ?? null;
}

export type CreativeWorkSourcePatch = Partial<Pick<CreativeWorkSource, "usage" | "status" | "contentAnalysis" | "styleAnalysis" | "failureCode">>;

export async function updateCreativeWorkSource(workspaceId: string, workItemId: string, sourceId: string, patch: CreativeWorkSourcePatch): Promise<CreativeWorkSource | null> {
  const [row] = await db.update(creativeWorkSources).set({ ...patch, updatedAt: new Date() }).where(and(
    eq(creativeWorkSources.workspaceId, workspaceId),
    eq(creativeWorkSources.workItemId, workItemId),
    eq(creativeWorkSources.id, sourceId),
  )).returning();
  return row ?? null;
}

export async function deleteCreativeWorkSource(workspaceId: string, workItemId: string, sourceId: string): Promise<CreativeWorkSource | null> {
  const [row] = await db.delete(creativeWorkSources).where(and(
    eq(creativeWorkSources.workspaceId, workspaceId),
    eq(creativeWorkSources.workItemId, workItemId),
    eq(creativeWorkSources.id, sourceId),
  )).returning();
  return row ?? null;
}

/** Workspace-scoped list for canonical queries (Phase 2). No cross-tenant leak. */
export async function listCreativeWorks(
  workspaceId: string,
  limit = 50
): Promise<CreativeWorkItem[]> {
  return db
    .select()
    .from(creativeWorkItems)
    .where(eq(creativeWorkItems.workspaceId, workspaceId))
    .orderBy(desc(creativeWorkItems.updatedAt))
    .limit(limit);
}

/**
 * Same as listCreativeWorks, but attaches real outputs so list/open share
 * identical projection rules (no synthetic rows).
 */
export async function listCreativeWorksWithOutputs(
  workspaceId: string,
  limit = 50
): Promise<Array<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[] }>> {
  const works = await listCreativeWorks(workspaceId, limit);
  if (works.length === 0) return [];

  const ids = works.map((w) => w.id);
  const outputs = await db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        inArray(creativeWorkOutputs.workItemId, ids)
      )
    )
    .orderBy(asc(creativeWorkOutputs.creativeLevel));

  const byWork = new Map<string, CreativeWorkOutput[]>();
  for (const output of outputs) {
    const list = byWork.get(output.workItemId) ?? [];
    list.push(output);
    byWork.set(output.workItemId, list);
  }

  return works.map((work) => ({
    work,
    outputs: byWork.get(work.id) ?? [],
  }));
}

export async function setCreativeWorkCopy(
  workspaceId: string,
  workItemId: string,
  copy: SocialPostCopy
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ copy })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .returning();
  return row ?? null;
}

/** Persist SocialPostBrief JSONB (canonical briefing write → brief column). */
export async function setCreativeWorkBrief(
  workspaceId: string,
  workItemId: string,
  brief: SocialPostBrief
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ brief })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .returning();
  return row ?? null;
}

export async function confirmCreativeWorkIdentity(
  workspaceId: string,
  workItemId: string,
  snapshot: CreativeWorkIdentitySnapshot
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ identitySnapshot: snapshot, status: "ready" })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Idempotent triplet creation: inserts one output per creative level using
 * `onConflictDoNothing`, then queries the resulting rows so repeated calls
 * return the same IDs.
 */
export async function createCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  targetFormat: CreativeWorkFormat = "4:5",
): Promise<CreativeWorkOutput[]> {
  const now = new Date();
  const seedRows = CREATIVE_LEVELS.map((creativeLevel) => ({
    workspaceId,
    workItemId,
    creativeLevel,
    targetFormat,
    versionNumber: 1,
    operationKey: `${creativeLevel}:${targetFormat}:1`,
    status: "queued" as const,
    isSelected: false,
    createdAt: now,
    updatedAt: now,
  }));

  await db
    .insert(creativeWorkOutputs)
    .values(seedRows)
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    )
    .orderBy(asc(creativeWorkOutputs.creativeLevel));

  return rows;
}

export type CreativeWorkOutputPlan = {
  creativeLevel: (typeof CREATIVE_LEVELS)[number];
  targetFormat: CreativeWorkFormat;
};

export async function createPlannedCreativeWorkOutputs(workspaceId: string, workItemId: string, plans: CreativeWorkOutputPlan[]): Promise<CreativeWorkOutput[]> {
  if (plans.length === 0) return [];
  const [work] = await db.select({ id: creativeWorkItems.id }).from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
  )).limit(1);
  if (!work) return [];
  const now = new Date();
  await db.insert(creativeWorkOutputs).values(plans.map((plan) => ({
    workspaceId,
    workItemId,
    creativeLevel: plan.creativeLevel,
    targetFormat: plan.targetFormat,
    versionNumber: 1,
    operationKey: `${plan.creativeLevel}:${plan.targetFormat}:1`,
    status: "queued" as const,
    isSelected: false,
    createdAt: now,
    updatedAt: now,
  }))).onConflictDoNothing();
  return db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
  )).orderBy(asc(creativeWorkOutputs.targetFormat), asc(creativeWorkOutputs.creativeLevel), asc(creativeWorkOutputs.versionNumber));
}

export async function createCreativeWorkRevision(
  workspaceId: string,
  workItemId: string,
  revisionKey: string,
  parentOutputId: string,
  instruction: string,
  revisionAssetId: string | null,
): Promise<CreativeWorkOutput | null> {
  const [existing] = await db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.operationKey, revisionKey),
  )).limit(1);
  if (existing) return existing;

  const [parent] = await db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, parentOutputId),
  )).limit(1);
  if (!parent) return null;
  if (revisionAssetId) {
    const [asset] = await db.select({ id: workspaceAssets.id }).from(workspaceAssets).where(and(
      eq(workspaceAssets.workspaceId, workspaceId),
      eq(workspaceAssets.id, revisionAssetId),
    )).limit(1);
    if (!asset) return null;
  }
  return db.transaction(async (tx) => {
    const versionScope = `${workspaceId}:${workItemId}:${parent.creativeLevel}:${parent.targetFormat}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${versionScope}))`);

    const [retry] = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, workspaceId),
      eq(creativeWorkOutputs.workItemId, workItemId),
      eq(creativeWorkOutputs.operationKey, revisionKey),
    )).limit(1);
    if (retry) return retry;

    const [latest] = await tx.select({ maxVersion: max(creativeWorkOutputs.versionNumber) })
      .from(creativeWorkOutputs)
      .where(and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.creativeLevel, parent.creativeLevel),
        eq(creativeWorkOutputs.targetFormat, parent.targetFormat),
      ));
    const versionNumber = (latest?.maxVersion ?? 0) + 1;
    const [row] = await tx.insert(creativeWorkOutputs).values({
      workspaceId,
      workItemId,
      creativeLevel: parent.creativeLevel,
      targetFormat: parent.targetFormat,
      versionNumber,
      parentOutputId,
      revisionInstruction: instruction,
      revisionAssetId,
      operationKey: revisionKey,
      status: "queued",
      isSelected: false,
    }).onConflictDoNothing().returning();
    if (row) return row;

    const [conflict] = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, workspaceId),
      eq(creativeWorkOutputs.workItemId, workItemId),
      eq(creativeWorkOutputs.operationKey, revisionKey),
    )).limit(1);
    if (!conflict) throw new Error("creative_work_revision_conflict_without_row");
    return conflict;
  });
}

export async function incrementCreativeWorkOutputRetry(workspaceId: string, workItemId: string, outputId: string): Promise<CreativeWorkOutput | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
    retryCount: sql`${creativeWorkOutputs.retryCount} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
  )).returning();
  return row ?? null;
}

export async function linkCreativeWorkCampaign(workspaceId: string, workItemId: string, campaignId: string): Promise<CreativeWorkItem | null> {
  const [work] = await db.select().from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
  )).limit(1);
  if (!work) return null;
  const campaign = await getCampaignById(campaignId, workspaceId);
  if (!campaign) return null;
  const campaignProfileId = await resolveCampaignClientProfileId(workspaceId, campaign);
  if (campaignProfileId && campaignProfileId !== work.clientProfileId) return null;
  const [row] = await db.update(creativeWorkItems).set({ campaignId, updatedAt: new Date() }).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
  )).returning();
  return row ?? null;
}

export async function markCreativeWorkOutputProcessing(
  workspaceId: string,
  workItemId: string,
  outputId: string
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId)
      )
    )
    .returning();
  return row ?? null;
}

export async function completeCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  data: CompleteCreativeWorkOutputData
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "completed",
      outputKey: data.outputKey,
      cost: data.cost,
      quality: data.quality,
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId)
      )
    )
    .returning();
  return row ?? null;
}

export async function failCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  failureCode: string
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "failed",
      failureCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId)
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Reconciles jobs that disappeared after dispatch (for example, a worker
 * serialization crash). Once the lease expires the output becomes terminal,
 * which lets the UI offer its existing retry action instead of polling forever.
 */
export async function failStaleCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  staleBefore: Date,
): Promise<CreativeWorkOutput[]> {
  return db
    .update(creativeWorkOutputs)
    .set({
      status: "failed",
      failureCode: "generation_timeout",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        inArray(creativeWorkOutputs.status, ["queued", "processing"]),
        lt(creativeWorkOutputs.updatedAt, staleBefore),
      ),
    )
    .returning();
}

/**
 * Directly set the work-item status. Used by the generate API route to
 * flip `"ready"` → `"generating"` immediately after dispatching the
 * triplet so the frontend polling hook engages. Aggregate recomputation
 * is left to {@link refreshCreativeWorkStatus} once outputs settle.
 */
export async function setCreativeWorkStatus(
  workspaceId: string,
  workItemId: string,
  status: CreativeWorkStatus
): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Recomputes the aggregate `creative_work_items.status` from the child
 * outputs and **persists** the result. The previous implementation only
 * computed the value in memory and never wrote it back, which meant the
 * `useCreativeWork` polling hook (keyed on `status === "generating"`)
 * never engaged after dispatch — the work row stayed at `"ready"`
 * forever, even when outputs were actively generating.
 *
 * Callers receive the resolved status so they can decide whether to take
 * downstream action (e.g. log a state change).
 */
export async function refreshCreativeWorkStatus(
  workspaceId: string,
  workItemId: string
): Promise<CreativeWorkStatus> {
  const outputs = await db
    .select({ status: creativeWorkOutputs.status })
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    );
  const next = resolveCreativeWorkStatus(outputs.map((o) => o.status));
  await db
    .update(creativeWorkItems)
    .set({ status: next, updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId)
      )
    );
  return next;
}

/**
 * Atomic selection: clears any previously selected output in the same
 * transaction before marking the new one. Relies on the unique partial index
 * on `is_selected = true` per work item to keep the invariant.
 */
export async function selectCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string
): Promise<CreativeWorkOutput | null> {
  return db.transaction(async (tx) => {
    await tx
      .update(creativeWorkOutputs)
      .set({ isSelected: false, updatedAt: new Date() })
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, workspaceId),
          eq(creativeWorkOutputs.workItemId, workItemId),
          eq(creativeWorkOutputs.isSelected, true)
        )
      );

    const [selected] = await tx
      .update(creativeWorkOutputs)
      .set({ isSelected: true, updatedAt: new Date() })
      .where(
        and(
          eq(creativeWorkOutputs.workspaceId, workspaceId),
          eq(creativeWorkOutputs.workItemId, workItemId),
          eq(creativeWorkOutputs.id, outputId)
        )
      )
      .returning();

    return selected ?? null;
  });
}

/**
 * Free retry: flip a failed output back to `queued` with a status guard so a
 * concurrent change loses the race cleanly (returns null). No billing side
 * effects — the original triplet charge already covered generation.
 */
export async function requeueFailedCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string
): Promise<CreativeWorkOutput | null> {
  const [reset] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "queued",
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "failed")
      )
    )
    .returning();
  return reset ?? null;
}
