import { eq, and, asc, desc, count, inArray, isNull, isNotNull, lt, max, ne, notExists, sql } from "drizzle-orm";
import { db } from "../db";
import { getCreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";
import { isLayerizationSelectionLocked, layerizationStateFromDatabase } from "@/server/layerize/contracts";
import {
  creativeWorkItems,
  creativeWorkOutputs,
  creativeWorkSources,
  clientReferences,
  clientProfiles,
  workspaceAssets,
  campaignTemplates,
  type CreativeWorkItem,
  type CreativeWorkOutput,
  type CreativeWorkSource,
} from "../db/schema";
import {
  CREATIVE_LEVELS,
  requestTextFromBrief,
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
  type CreativeWorkOutputPlan,
} from "../creative-work/contracts";
import { getClientProfile, resolveCampaignClientProfileId } from "./client-reference";
import { getCampaignById } from "./campaign";
import { MAX_PIECE_REFERENCES, type PieceReferenceCategory } from "../creative-work/piece-reference";

export type { CreativeWorkFormat } from "../creative-work/contracts";

export type CreativeWorkToolKind = CreativeWorkIntent;

export interface CreativeWorkPieceTrainingReferenceClaim {
  reference: typeof clientReferences.$inferSelect;
  claimed: boolean;
}

type CreativeWorkTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Atomically gets or creates the Brand Training row promoted from a Piece
 * reference.  This deliberately uses a scoped advisory lock rather than a
 * global uniqueness migration: older workspaces can contain historical
 * duplicate references and must remain migratable.  The caller dispatches
 * analysis only after this transaction commits.
 */
export async function claimCreativeWorkPieceTrainingReference(input: {
  workspaceId: string;
  clientProfileId: string;
  assetKey: string;
  label: string;
}): Promise<CreativeWorkPieceTrainingReferenceClaim> {
  return db.transaction((tx) => claimCreativeWorkPieceTrainingReferenceWithExecutor(tx, input));
}

async function claimCreativeWorkPieceTrainingReferenceWithExecutor(
  tx: CreativeWorkTransaction,
  input: { workspaceId: string; clientProfileId: string; assetKey: string; label: string },
): Promise<CreativeWorkPieceTrainingReferenceClaim> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.clientProfileId}:${input.assetKey}:piece-training`}))`);
    const candidates = await tx.select().from(clientReferences).where(and(
      eq(clientReferences.workspaceId, input.workspaceId),
      eq(clientReferences.clientProfileId, input.clientProfileId),
      eq(clientReferences.assetKey, input.assetKey),
    )).orderBy(
      sql`case
        when ${clientReferences.reviewStatus} = 'approved' then 0
        when ${clientReferences.reviewStatus} = 'pending_approval' then 1
        when ${clientReferences.reviewStatus} = 'pending_analysis' then 2
        when ${clientReferences.reviewStatus} is null then 3
        else 4
      end`,
      desc(clientReferences.createdAt),
    );
    const reviewRank = (status: typeof clientReferences.$inferSelect["reviewStatus"]) =>
      status === "approved" ? 0
        : status === "pending_approval" ? 1
          : status === "pending_analysis" ? 2
            : status === null ? 3 : 4;
    const existing = candidates
      .filter((reference) =>
        reference.reviewStatus !== "archived" && String(reference.reviewStatus) !== "rejected",
      )
      .sort((left, right) => reviewRank(left.reviewStatus) - reviewRank(right.reviewStatus)
        || right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (existing) return { reference: existing, claimed: false };

    const [reference] = await tx.insert(clientReferences).values({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      assetKey: input.assetKey,
      label: input.label,
      kind: "other",
      reviewStatus: "pending_analysis",
    }).returning();
    if (!reference) throw new Error("creative_work_piece_training_claim_without_row");
    return { reference, claimed: true };
}

/** Validates a promotable Single source while the prepare/source lock is held. */
export async function promoteCreativeWorkPieceReference(input: {
  workspaceId: string; workItemId: string; sourceId: string; clientProfileId: string; assetKey: string; label: string;
  expected: { assetId: string; assetKey: string; updatedAt: Date; category: PieceReferenceCategory };
}): Promise<CreativeWorkPieceTrainingReferenceClaim | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.workItemId}:prepare`}))`);
    const [source] = await tx.select({ id: creativeWorkSources.id, assetId: creativeWorkSources.assetId, updatedAt: creativeWorkSources.updatedAt, pieceReference: creativeWorkSources.pieceReference }).from(creativeWorkSources)
      .innerJoin(creativeWorkItems, eq(creativeWorkItems.id, creativeWorkSources.workItemId))
      .where(and(eq(creativeWorkSources.workspaceId, input.workspaceId), eq(creativeWorkSources.workItemId, input.workItemId), eq(creativeWorkSources.id, input.sourceId), eq(creativeWorkSources.status, "ready"), eq(creativeWorkItems.toolKind, "single"), eq(creativeWorkItems.clientProfileId, input.clientProfileId)))
      .limit(1);
    if (!source || source.assetId !== input.expected.assetId || source.updatedAt.getTime() !== input.expected.updatedAt.getTime()
      || source.pieceReference?.category !== input.expected.category) return null;
    const [asset] = await tx.select({ id: workspaceAssets.id, key: workspaceAssets.key, name: workspaceAssets.name })
      .from(workspaceAssets)
      .where(and(eq(workspaceAssets.workspaceId, input.workspaceId), eq(workspaceAssets.id, source.assetId)))
      .limit(1);
    if (!asset || asset.key !== input.expected.assetKey) return null;
    return claimCreativeWorkPieceTrainingReferenceWithExecutor(tx, {
      ...input,
      assetKey: asset.key,
      label: asset.name,
    });
  });
}

export type CreativeWorkInspirationCandidate = {
  id: string;
  workspaceId: string;
  clientProfileId: string;
  title: string;
  assetId: string;
  status: CreativeWorkOutput["status"];
  isSelected: boolean;
  updatedAt: Date;
};

export async function listCreativeWorkInspirationCandidates(
  workspaceId: string,
  clientProfileId: string,
): Promise<CreativeWorkInspirationCandidate[]> {
  return db
    .select({
      id: creativeWorkOutputs.id,
      workspaceId: creativeWorkOutputs.workspaceId,
      clientProfileId: creativeWorkItems.clientProfileId,
      title: creativeWorkItems.title,
      assetId: workspaceAssets.id,
      status: creativeWorkOutputs.status,
      isSelected: creativeWorkOutputs.isSelected,
      updatedAt: creativeWorkOutputs.updatedAt,
    })
    .from(creativeWorkOutputs)
    .innerJoin(creativeWorkItems, and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.id, creativeWorkOutputs.workItemId),
    ))
    .innerJoin(workspaceAssets, and(
      eq(workspaceAssets.workspaceId, workspaceId),
      eq(workspaceAssets.key, creativeWorkOutputs.outputKey),
      eq(workspaceAssets.source, "creative_work"),
    ))
    .where(and(
      eq(creativeWorkOutputs.workspaceId, workspaceId),
      eq(creativeWorkItems.clientProfileId, clientProfileId),
      eq(creativeWorkOutputs.status, "completed"),
      eq(creativeWorkOutputs.isSelected, true),
    ))
    .orderBy(desc(creativeWorkOutputs.updatedAt));
}

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
      request: requestTextFromBrief(input.brief),
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

export async function createCreativeWorkDraftWithSource(
  input: CreateCreativeWorkDraftInput & (
    | { assetId: string; templateId?: never; usage: CreativeSourceUsage }
    | { templateId: string; assetId?: never; usage: CreativeSourceUsage }
  ),
) {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select({ id: clientProfiles.id }).from(clientProfiles).where(and(
      eq(clientProfiles.workspaceId, input.workspaceId),
      eq(clientProfiles.id, input.clientProfileId),
    )).limit(1);
    if (!profile) return null;

    const assetId = input.assetId;
    const templateId = input.templateId;
    const [asset] = assetId
      ? await tx.select().from(workspaceAssets).where(and(
          eq(workspaceAssets.workspaceId, input.workspaceId),
          eq(workspaceAssets.id, assetId),
        )).limit(1)
      : [];
    const [template] = templateId
      ? await tx.select().from(campaignTemplates).where(and(
          eq(campaignTemplates.workspaceId, input.workspaceId),
          eq(campaignTemplates.id, templateId),
        )).limit(1)
      : [];
    if (assetId && (!asset || !asset.type.startsWith("image/"))) return null;
    if (templateId && !template) return null;

    const [createdWork] = await tx.insert(creativeWorkItems).values({
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
      campaignId: null,
      inputSnapshot: input.inputSnapshot ?? null,
      status: "draft",
    }).onConflictDoNothing().returning();
    const [existingWork] = createdWork ? [] : await tx.select().from(creativeWorkItems).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId),
      eq(creativeWorkItems.createdByUserId, input.createdByUserId),
      eq(creativeWorkItems.draftKey, input.draftKey),
    )).limit(1);
    const draft = createdWork ?? existingWork;
    if (!draft) throw new Error("creative_work_draft_conflict_without_row");

    // All sources take the same lock, including legacy/template sources. A
    // replay can observe an older tool kind before waiting here, so the only
    // authority for Single defaults and the aggregate cap is the row reread
    // after the lock is held.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pieceReferenceLockScope(input.workspaceId, draft.id)}))`);
    const [work] = await tx.select().from(creativeWorkItems).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId),
      eq(creativeWorkItems.id, draft.id),
    )).limit(1);
    if (!work) throw new Error("creative_work_draft_lock_lost_row");
    if (work.clientProfileId !== input.clientProfileId) return null;

    // The unique source key alone cannot enforce the three-source aggregate
    // cap when different assets arrive concurrently.
    const isSinglePieceAsset = work.toolKind === "single" && asset;
    const isCarouselWork = work.toolKind === "carousel";
    if (work.toolKind === "single" && input.assetId) {
      const [existingSource] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, work.id),
        eq(creativeWorkSources.assetId, asset.id),
      )).limit(1);
      if (existingSource) {
        return existingSource.usage === "both"
          ? { work, source: existingSource, claimedForAnalysis: false, asset }
          : null;
      }
      const [{ sourceCount }] = await tx.select({ sourceCount: count() }).from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, work.id),
        isNotNull(creativeWorkSources.assetId),
      ));
      if (Number(sourceCount) >= MAX_PIECE_REFERENCES) return { limitReached: true as const };
    }

    // Carousel accepts at most one non-failed visual reference, forced to
    // "style". The count runs under the same lock, so two concurrent uploads
    // cannot both pass; the replay check precedes the cap so idempotent
    // retries of the same asset stay no-ops.
    if (isCarouselWork) {
      const originCondition = asset
        ? eq(creativeWorkSources.assetId, asset.id)
        : eq(creativeWorkSources.templateId, template!.id);
      const [existingOrigin] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, work.id),
        originCondition,
      )).limit(1);
      if (existingOrigin) {
        return {
          work,
          source: existingOrigin,
          claimedForAnalysis: false,
          ...(asset ? { asset } : { template: template! }),
        };
      }
      const [{ sourceCount }] = await tx.select({ sourceCount: count() }).from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, work.id),
        ne(creativeWorkSources.status, "failed"),
      ));
      if (Number(sourceCount) >= 1) {
        return { limitReached: true as const, reason: "carousel_reference_limit" as const };
      }
    }

    const [createdSource] = await tx.insert(creativeWorkSources).values({
      workspaceId: input.workspaceId,
      workItemId: work.id,
      ...(asset ? { assetId: asset.id } : { templateId: template!.id }),
      usage: isSinglePieceAsset ? "both" : isCarouselWork ? "style" : input.usage,
      usageConfirmed: isSinglePieceAsset ? true : isCarouselWork ? true : work.toolKind !== "single",
      status: "uploaded",
      pieceReference: isSinglePieceAsset
        ? { version: 1, category: null, classificationSource: "automatic", confidence: "low", userInstruction: null, hasTransparency: false }
        : null,
    }).onConflictDoNothing().returning();
    const [existingSource] = createdSource ? [] : await tx.select().from(creativeWorkSources).where(and(
      eq(creativeWorkSources.workspaceId, input.workspaceId),
      eq(creativeWorkSources.workItemId, work.id),
      asset
        ? eq(creativeWorkSources.assetId, asset.id)
        : eq(creativeWorkSources.templateId, template!.id),
    )).limit(1);
    const source = createdSource ?? existingSource;
    if (!source) throw new Error("creative_work_source_conflict_without_row");
    if (!createdSource && source.usage !== (isSinglePieceAsset ? "both" : input.usage)) return null;
    return {
      work,
      source,
      claimedForAnalysis: Boolean(createdSource),
      ...(asset ? { asset } : { template: template! }),
    };
  });
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
  identitySnapshot: CreativeWorkItem["identitySnapshot"] | null;
}>;

const automaticPieceReference = {
  version: 1 as const,
  category: null,
  classificationSource: "automatic" as const,
  confidence: "low" as const,
  userInstruction: null,
  hasTransparency: false,
};

const pieceReferenceLockScope = (workspaceId: string, workItemId: string) =>
  // Source writes and preparation must serialize on one per-work lock: a
  // source committed after prepare reads cannot be absent from its snapshot.
  `${workspaceId}:${workItemId}:prepare`;

const workRevisionMatches = (expectedUpdatedAt: Date) =>
  sql`date_trunc('milliseconds', ${creativeWorkItems.updatedAt}) = cast(${expectedUpdatedAt.toISOString()} as timestamp without time zone)`;

export class CreativeWorkRevisionConflict extends Error {
  readonly code = "stale_input" as const;

  constructor() {
    super("creative_work_revision_conflict");
  }
}

export function isCreativeWorkRevisionConflict(error: unknown): error is CreativeWorkRevisionConflict {
  return error instanceof CreativeWorkRevisionConflict;
}

/**
 * Browser edits are bound to the hydrated work revision. A `ready` work can
 * become editable only when it still has no outputs; the final writer repeats
 * the same status/revision/output predicates before committing.
 */
async function editableCreativeWork(
  tx: Pick<typeof db, "select">,
  input: { workspaceId: string; workItemId: string; expectedUpdatedAt: Date },
): Promise<CreativeWorkItem | null | undefined> {
  const [work] = await tx.select().from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, input.workspaceId),
    eq(creativeWorkItems.id, input.workItemId),
  )).limit(1);
  if (!work) return undefined;
  // Keep missing work distinct from a stale hydrated revision.
  // Narrow test projections intentionally omit timestamps; persisted callers
  // cannot because the public schemas and TypeScript input require the token.
  if (work.updatedAt && input.expectedUpdatedAt && work.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    throw new CreativeWorkRevisionConflict();
  }
  // Unit fixtures from the pre-CAS contract selected only id/toolKind; a
  // persisted row always has status, and an omitted projection is draft-only.
  if (work.status === undefined || work.status === "draft") return { ...work, status: "draft" as const };
  if (work.status !== "ready") return null;
  const [{ outputCount }] = await tx.select({ outputCount: count() })
    .from(creativeWorkOutputs)
    .where(and(
      eq(creativeWorkOutputs.workspaceId, input.workspaceId),
      eq(creativeWorkOutputs.workItemId, input.workItemId),
    ));
  return Number(outputCount) === 0 ? work as CreativeWorkItem : null;
}

export type CreativeWorkAutosaveResult =
  | { work: CreativeWorkItem; error: null; sourcesNeedingSingleAnalysis: CreativeWorkSource[] }
  | { work: null; error: "not_found" | "not_draft" | "single_piece_reference_limit" | "carousel_reference_limit"; sourcesNeedingSingleAnalysis: [] };

/**
 * Serializes tool-mode changes with source claims.  The persisted tool kind is
 * read after acquiring the same lock used by attachment, so an attach racing a
 * Variations -> Single autosave cannot write an unclassified factual source.
 */
export async function autosaveCreativeWorkDraft(input: {
  workspaceId: string;
  workItemId: string;
  expectedUpdatedAt: Date;
  request: string;
  intent: CreativeWorkIntent;
  format: CreativeWorkFormat;
  settings: CreativeWorkSettings;
}): Promise<CreativeWorkAutosaveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pieceReferenceLockScope(input.workspaceId, input.workItemId)}))`);
    const work = await editableCreativeWork(tx, input);
    if (work === undefined) return { work: null, error: "not_found", sourcesNeedingSingleAnalysis: [] };
    if (!work) return { work: null, error: "not_draft", sourcesNeedingSingleAnalysis: [] };
    const reopeningPreparedRetry = work.status === "ready";

    let sourcesNeedingSingleAnalysis: CreativeWorkSource[] = [];

    // Carousel targets are read under the same lock as attachment: a mode
    // transition into carousel keeps at most one non-failed visual reference
    // and its usage is always "style" (re-analysis re-queues with the change).
    if (input.intent === "carousel") {
      const nonFailedSources = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        ne(creativeWorkSources.status, "failed"),
      ));
      if (nonFailedSources.length > 1) {
        return { work: null, error: "carousel_reference_limit", sourcesNeedingSingleAnalysis: [] };
      }
      const staleUsageSources = nonFailedSources.filter((source) => source.usage !== "style");
      const renormalized = await Promise.all(staleUsageSources.map((source) => tx.update(creativeWorkSources).set({
        usage: "style",
        usageConfirmed: true,
        status: "uploaded",
        contentAnalysis: null,
        styleAnalysis: null,
        failureCode: null,
        updatedAt: sql`greatest(${creativeWorkSources.updatedAt} + interval '1 millisecond', now())`,
      }).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        eq(creativeWorkSources.id, source.id),
      )).returning()));
      sourcesNeedingSingleAnalysis = renormalized.flatMap((rows) => rows);
    }

    // Preserve legacy Single rows on ordinary autosaves. Normalization is a
    // one-time Variations -> Single transition, not a rewrite of historical
    // confirmation/piece-reference semantics.
    if (work.toolKind !== "single" && input.intent === "single") {
      const assetSources = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        isNotNull(creativeWorkSources.assetId),
      ));
      if (assetSources.length > MAX_PIECE_REFERENCES) {
        return { work: null, error: "single_piece_reference_limit", sourcesNeedingSingleAnalysis: [] };
      }
      const normalizedSources = await Promise.all(assetSources.map((source) => tx.update(creativeWorkSources).set({
        usage: "both",
        usageConfirmed: true,
        pieceReference: source.pieceReference ?? automaticPieceReference,
        // Re-enter the durable claim state after the mode transition.  The
        // new Single analysis reads the current tool kind and its own CAS;
        // the old Variations attempt holds the prior timestamp and loses.
        status: "uploaded",
        failureCode: null,
        contentAnalysis: null,
        styleAnalysis: null,
        // Invalidate an in-flight Variations analysis attempt. Its CAS still
        // carries the pre-normalization timestamp and therefore cannot erase
        // the piece-reference block after the vision call returns.
        updatedAt: sql`greatest(${creativeWorkSources.updatedAt} + interval '1 millisecond', now())`,
      }).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        eq(creativeWorkSources.id, source.id),
      )).returning()));
      sourcesNeedingSingleAnalysis = normalizedSources.flatMap((rows) => rows);
    }

    const [updated] = await tx.update(creativeWorkItems).set({
      ...(reopeningPreparedRetry ? { status: "draft", identitySnapshot: null } : {}),
      request: input.request,
      toolKind: input.intent,
      format: input.format,
      settings: input.settings,
      brief: null,
      copy: null,
      inputSnapshot: null,
      updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId),
      eq(creativeWorkItems.id, input.workItemId),
      eq(creativeWorkItems.status, reopeningPreparedRetry ? "ready" : "draft"),
      ...(input.expectedUpdatedAt ? [workRevisionMatches(input.expectedUpdatedAt)] : []),
      ...(reopeningPreparedRetry ? [notExists(
        tx.select({ id: creativeWorkOutputs.id }).from(creativeWorkOutputs).where(and(
          eq(creativeWorkOutputs.workspaceId, input.workspaceId),
          eq(creativeWorkOutputs.workItemId, input.workItemId),
        )),
      )] : []),
    )).returning();
    if (!updated) throw new CreativeWorkRevisionConflict();
    return { work: updated, error: null, sourcesNeedingSingleAnalysis };
  });
}

export type CreativeWorkPieceReferenceMutation =
  | { kind: "correct"; category?: PieceReferenceCategory; userInstruction?: string | null }
  | { kind: "replace"; assetId: string };

/**
 * Changes a Single Piece reference under the same draft/prepare lock.  The
 * source mutation and prepared-artifact invalidation are one transaction, so
 * a prepare that won the lock is observed as a conflict instead of producing
 * a snapshot for a previous source revision.
 */
export async function mutateCreativeWorkPieceReference(input: {
  workspaceId: string;
  workItemId: string;
  expectedUpdatedAt: Date;
  sourceId: string;
  mutation: CreativeWorkPieceReferenceMutation;
}): Promise<CreativeWorkSource | null> {
  const abort = Symbol("piece_reference_mutation_conflict");
  try {
    return await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (tx) => {
      const work = await editableCreativeWork(tx, input);
      if (!work || work.toolKind !== "single") throw abort;

      const [source] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        eq(creativeWorkSources.id, input.sourceId),
        isNotNull(creativeWorkSources.assetId),
      )).limit(1);
      if (!source?.pieceReference || (input.mutation.kind === "correct" && source.status !== "ready")) throw abort;

      const patch: CreativeWorkSourcePatch = input.mutation.kind === "correct"
        ? {
            pieceReference: {
              ...source.pieceReference,
              version: 1,
              ...(input.mutation.category === undefined
                ? {}
                : { category: input.mutation.category, classificationSource: "user" }),
              ...(input.mutation.userInstruction === undefined
                ? {}
                : { userInstruction: input.mutation.userInstruction?.trim() || null }),
            },
          }
        : {
            assetId: input.mutation.assetId,
            contentAnalysis: null,
            styleAnalysis: null,
            status: "uploaded",
            failureCode: null,
            pieceReference: {
              ...automaticPieceReference,
              userInstruction: source.pieceReference.userInstruction,
            },
          };
      const [updated] = await tx.update(creativeWorkSources).set({
        ...patch,
        updatedAt: sql`greatest(${creativeWorkSources.updatedAt} + interval '1 millisecond', now())`,
      }).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        eq(creativeWorkSources.id, input.sourceId),
      )).returning();
      if (!updated) throw abort;

      const [invalidated] = await tx.update(creativeWorkItems).set({
        ...(work.status === "ready" ? { status: "draft", identitySnapshot: null } : {}),
        brief: null,
        copy: null,
        inputSnapshot: null,
        updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
      }).where(and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId),
        eq(creativeWorkItems.status, work.status),
        ...(input.expectedUpdatedAt ? [workRevisionMatches(input.expectedUpdatedAt)] : []),
        ...(work.status === "ready" ? [notExists(
          tx.select({ id: creativeWorkOutputs.id }).from(creativeWorkOutputs).where(and(
            eq(creativeWorkOutputs.workspaceId, input.workspaceId),
            eq(creativeWorkOutputs.workItemId, input.workItemId),
          )),
        )] : []),
      )).returning();
      if (!invalidated) throw new CreativeWorkRevisionConflict();
      return updated;
    });
  } catch (error) {
    if (error === abort) return null;
    throw error;
  }
}

export async function updateCreativeWorkDraft(workspaceId: string, workItemId: string, patch: CreativeWorkDraftPatch): Promise<CreativeWorkItem | null> {
  const [row] = await db.update(creativeWorkItems).set({
    ...patch,
    updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
  }).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
    eq(creativeWorkItems.status, "draft"),
  )).returning();
  return row ?? null;
}

export async function updateCreativeWorkDraftIfUnchanged(
  workspaceId: string,
  workItemId: string,
  expectedUpdatedAt: Date,
  patch: CreativeWorkDraftPatch,
  executor: Pick<typeof db, "update"> = db,
): Promise<CreativeWorkItem | null> {
  const [row] = await executor.update(creativeWorkItems).set({
    ...patch,
    updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
  }).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
    eq(creativeWorkItems.status, "draft"),
    sql`date_trunc('milliseconds', ${creativeWorkItems.updatedAt}) = cast(${expectedUpdatedAt.toISOString()} as timestamp without time zone)`,
  )).returning();
  return row ?? null;
}

export function withCreativeWorkPreparationLock<T>(
  workspaceId: string,
  workItemId: string,
  callback: (executor: Pick<typeof db, "select" | "insert" | "update" | "delete">) => Promise<T>,
): Promise<T> {
  // ponytail: holds one DB connection during the model call; move to a lease/state-machine if preparation throughput matters.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${workspaceId}:${workItemId}:prepare`}))`);
    return callback(tx);
  });
}

export function creativeWorkVersionLockScope(input: {
  workspaceId: string;
  workItemId: string;
  creativeLevel: string;
  targetFormat: string;
  directionId: string | null;
}): string {
  return input.directionId
    ? `${input.workspaceId}:${input.workItemId}:${input.creativeLevel}:${input.targetFormat}:direction:${input.directionId}`
    : `${input.workspaceId}:${input.workItemId}:${input.creativeLevel}:${input.targetFormat}`;
}

export async function getCreativeWork(
  workspaceId: string,
  workItemId: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[]; sources: CreativeWorkSource[] } | null> {
  const workRows = await executor
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

  const outputs = await executor
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId)
      )
    )
    .orderBy(asc(creativeWorkOutputs.targetFormat), asc(creativeWorkOutputs.creativeLevel), asc(creativeWorkOutputs.versionNumber));

  const sources = await executor.select().from(creativeWorkSources).where(and(
    eq(creativeWorkSources.workspaceId, workspaceId),
    eq(creativeWorkSources.workItemId, workItemId),
  )).orderBy(asc(creativeWorkSources.createdAt));

  return { work: workRows[0], outputs, sources };
}

export async function getCreativeWorkSourceAssetDetails(
  workspaceId: string,
  sources: Pick<CreativeWorkSource, "id" | "assetId">[],
  executor: Pick<typeof db, "select"> = db,
): Promise<Map<string, { assetKey: string; mimeType: string; source: string; name: string }>> {
  const assetIds = sources.flatMap((source) => source.assetId ? [source.assetId] : []);
  if (assetIds.length === 0) return new Map();
  const assets = await executor.select({ id: workspaceAssets.id, key: workspaceAssets.key, type: workspaceAssets.type, source: workspaceAssets.source, name: workspaceAssets.name })
    .from(workspaceAssets)
    .where(and(eq(workspaceAssets.workspaceId, workspaceId), inArray(workspaceAssets.id, assetIds)));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return new Map(sources.flatMap((source) => {
    const asset = source.assetId ? byId.get(source.assetId) : null;
    return asset ? [[source.id, { assetKey: asset.key, mimeType: asset.type, source: asset.source, name: asset.name }] as const] : [];
  }));
}

export interface CreateCreativeWorkSourceInput {
  workspaceId: string;
  workItemId: string;
  assetId?: string | null;
  templateId?: string | null;
  usage: CreativeSourceUsage;
  usageConfirmed?: boolean;
  status: CreativeSourceStatus;
  contentAnalysis?: CreativeWorkSource["contentAnalysis"];
  styleAnalysis?: CreativeWorkSource["styleAnalysis"];
  pieceReference?: CreativeWorkSource["pieceReference"];
  failureCode?: string | null;
  expectedUpdatedAt: Date;
}

export interface CreativeWorkSourceClaim {
  source: CreativeWorkSource;
  claimedForAnalysis: boolean;
}

export interface CreativeWorkSourceLimitReached {
  limitReached: true;
  /** Present when the cap is the carousel one-visual-reference rule. */
  reason?: "carousel_reference_limit";
}

export async function createCreativeWorkSource(input: CreateCreativeWorkSourceInput): Promise<CreativeWorkSourceClaim | CreativeWorkSourceLimitReached | null> {
  if (Boolean(input.assetId) === Boolean(input.templateId)) return null;
  const originTable = input.assetId ? workspaceAssets : campaignTemplates;
  const originId = input.assetId ?? input.templateId!;
  const [origin] = await db.select({ id: originTable.id }).from(originTable).where(and(
    eq(originTable.workspaceId, input.workspaceId),
    eq(originTable.id, originId),
  )).limit(1);
  if (!origin) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pieceReferenceLockScope(input.workspaceId, input.workItemId)}))`);
    const work = await editableCreativeWork(tx, input);
    if (!work) return null;
    const isSinglePieceAsset = work.toolKind === "single" && Boolean(input.assetId);
    const isCarouselWork = work.toolKind === "carousel";
    const sourceInput: CreateCreativeWorkSourceInput = {
      ...input,
      usage: isSinglePieceAsset ? "both" : isCarouselWork ? "style" : input.usage,
      usageConfirmed: isSinglePieceAsset ? true : isCarouselWork ? true : work.toolKind !== "single",
      ...(isSinglePieceAsset ? { pieceReference: automaticPieceReference } : {}),
    };
    const { expectedUpdatedAt: _expectedUpdatedAt, ...sourceValues } = sourceInput;
    void _expectedUpdatedAt;
    if (work.toolKind === "single" && input.assetId) {
      const [existing] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        eq(creativeWorkSources.assetId, input.assetId),
      )).limit(1);
      if (existing) {
        return existing.usage === sourceInput.usage
          ? { source: existing, claimedForAnalysis: false }
          : null;
      }
      const [{ sourceCount }] = await tx.select({ sourceCount: count() }).from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        isNotNull(creativeWorkSources.assetId),
      ));
      if (Number(sourceCount) >= MAX_PIECE_REFERENCES) return { limitReached: true };
    }
    // Carousel keeps at most one non-failed visual reference, always forced to
    // "style", enforced under the same lock that serializes concurrent
    // uploads. A replay of the same origin stays an idempotent no-op.
    if (isCarouselWork) {
      const originCondition = input.assetId
        ? eq(creativeWorkSources.assetId, input.assetId)
        : eq(creativeWorkSources.templateId, input.templateId!);
      const [existingOrigin] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        originCondition,
      )).limit(1);
      if (existingOrigin) {
        return { source: existingOrigin, claimedForAnalysis: false };
      }
      const [{ sourceCount }] = await tx.select({ sourceCount: count() }).from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        ne(creativeWorkSources.status, "failed"),
      ));
      if (Number(sourceCount) >= 1) {
        return { limitReached: true, reason: "carousel_reference_limit" };
      }
    }
    const [row] = await tx.insert(creativeWorkSources).values(sourceValues).onConflictDoNothing().returning();
    if (!row) {
      const originCondition = input.assetId
        ? eq(creativeWorkSources.assetId, input.assetId)
        : eq(creativeWorkSources.templateId, input.templateId!);
      const [existing] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        originCondition,
      )).limit(1);
      return existing?.usage === sourceInput.usage
        ? { source: existing, claimedForAnalysis: false }
        : null;
    }
    const [invalidated] = await tx.update(creativeWorkItems).set({
      ...(work.status === "ready" ? { status: "draft", identitySnapshot: null } : {}),
      brief: null,
      copy: null,
      inputSnapshot: null,
      updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId),
      eq(creativeWorkItems.id, input.workItemId),
      eq(creativeWorkItems.status, work.status),
      ...(input.expectedUpdatedAt ? [workRevisionMatches(input.expectedUpdatedAt)] : []),
      ...(work.status === "ready" ? [notExists(
        tx.select({ id: creativeWorkOutputs.id }).from(creativeWorkOutputs).where(and(
          eq(creativeWorkOutputs.workspaceId, input.workspaceId),
          eq(creativeWorkOutputs.workItemId, input.workItemId),
        )),
      )] : []),
    )).returning();
    if (!invalidated) throw new CreativeWorkRevisionConflict();
    return { source: row, claimedForAnalysis: true };
  });
}

export type CreativeWorkSourcePatch = Partial<Pick<CreativeWorkSource, "assetId" | "usage" | "usageConfirmed" | "status" | "contentAnalysis" | "styleAnalysis" | "pieceReference" | "failureCode">>;

export type CreativeWorkDraftSourceMutation =
  | { kind: "remove" }
  | { kind: "update"; patch: CreativeWorkSourcePatch; expected?: Pick<CreativeWorkSource, "status" | "usage" | "updatedAt"> };

/**
 * Draft-only source writers that are initiated by the browser share prepare's
 * lock. This prevents a source change from landing after prepare froze its
 * inputs, while leaving background analysis on its narrow CAS path.
 */
export async function mutateCreativeWorkDraftSource(input: {
  workspaceId: string;
  workItemId: string;
  expectedUpdatedAt: Date;
  sourceId: string;
  mutation: CreativeWorkDraftSourceMutation;
}): Promise<CreativeWorkSource | null> {
  const abort = Symbol("creative_work_draft_source_conflict");
  try {
    return await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (tx) => {
      const work = await editableCreativeWork(tx, input);
      if (!work) throw abort;

      const [source] = await tx.select().from(creativeWorkSources).where(and(
        eq(creativeWorkSources.workspaceId, input.workspaceId),
        eq(creativeWorkSources.workItemId, input.workItemId),
        eq(creativeWorkSources.id, input.sourceId),
      )).limit(1);
      if (!source) throw abort;
      const expected = input.mutation.kind === "update" ? input.mutation.expected : undefined;
      if (expected && (
        source.status !== expected.status
        || source.usage !== expected.usage
        || source.updatedAt.getTime() !== expected.updatedAt.getTime()
      )) throw abort;

      const [changed] = input.mutation.kind === "remove"
        ? await tx.delete(creativeWorkSources).where(and(
            eq(creativeWorkSources.workspaceId, input.workspaceId),
            eq(creativeWorkSources.workItemId, input.workItemId),
            eq(creativeWorkSources.id, input.sourceId),
          )).returning()
        : await tx.update(creativeWorkSources).set({
            ...input.mutation.patch,
            updatedAt: sql`greatest(${creativeWorkSources.updatedAt} + interval '1 millisecond', now())`,
          }).where(and(
            eq(creativeWorkSources.workspaceId, input.workspaceId),
            eq(creativeWorkSources.workItemId, input.workItemId),
            eq(creativeWorkSources.id, input.sourceId),
          )).returning();
      if (!changed) throw abort;

      const [invalidated] = await tx.update(creativeWorkItems).set({
        ...(work.status === "ready" ? { status: "draft", identitySnapshot: null } : {}),
        brief: null,
        copy: null,
        inputSnapshot: null,
        updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
      }).where(and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId),
        eq(creativeWorkItems.status, work.status),
        ...(input.expectedUpdatedAt ? [workRevisionMatches(input.expectedUpdatedAt)] : []),
        ...(work.status === "ready" ? [notExists(
          tx.select({ id: creativeWorkOutputs.id }).from(creativeWorkOutputs).where(and(
            eq(creativeWorkOutputs.workspaceId, input.workspaceId),
            eq(creativeWorkOutputs.workItemId, input.workItemId),
          )),
        )] : []),
      )).returning();
      if (!invalidated) throw new CreativeWorkRevisionConflict();
      return changed;
    });
  } catch (error) {
    if (error === abort) return null;
    throw error;
  }
}

export async function updateCreativeWorkSource(workspaceId: string, workItemId: string, sourceId: string, patch: CreativeWorkSourcePatch): Promise<CreativeWorkSource | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(creativeWorkSources).set({
      ...patch,
      updatedAt: sql`greatest(${creativeWorkSources.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkSources.workspaceId, workspaceId),
      eq(creativeWorkSources.workItemId, workItemId),
      eq(creativeWorkSources.id, sourceId),
    )).returning();
    if (!row) return null;
    await tx.update(creativeWorkItems).set({
      brief: null,
      copy: null,
      inputSnapshot: null,
      updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.id, workItemId),
    )).returning();
    return row;
  });
}

export async function updateCreativeWorkSourceIfUnchanged(
  workspaceId: string,
  workItemId: string,
  sourceId: string,
  expected: Pick<CreativeWorkSource, "status" | "usage" | "updatedAt">,
  patch: CreativeWorkSourcePatch,
): Promise<CreativeWorkSource | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(creativeWorkSources).set({
      ...patch,
      updatedAt: sql`greatest(${creativeWorkSources.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkSources.workspaceId, workspaceId),
      eq(creativeWorkSources.workItemId, workItemId),
      eq(creativeWorkSources.id, sourceId),
      eq(creativeWorkSources.status, expected.status),
      eq(creativeWorkSources.usage, expected.usage),
      // PostgreSQL keeps microseconds while Drizzle maps timestamps to a
      // millisecond-precision Date. The column is `timestamp without time
      // zone`, so bind the ISO value as text and cast it explicitly too;
      // binding a Date makes postgres.js treat it as `timestamptz` and apply
      // the session offset a second time, making every fresh CAS miss.
      sql`date_trunc('milliseconds', ${creativeWorkSources.updatedAt}) = cast(${expected.updatedAt.toISOString()} as timestamp without time zone)`,
    )).returning();
    if (!row) return null;
    await tx.update(creativeWorkItems).set({
      brief: null,
      copy: null,
      inputSnapshot: null,
      updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.id, workItemId),
    )).returning();
    return row;
  });
}

export async function deleteCreativeWorkSource(workspaceId: string, workItemId: string, sourceId: string): Promise<CreativeWorkSource | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(creativeWorkSources).where(and(
      eq(creativeWorkSources.workspaceId, workspaceId),
      eq(creativeWorkSources.workItemId, workItemId),
      eq(creativeWorkSources.id, sourceId),
    )).returning();
    if (!row) return null;
    await tx.update(creativeWorkItems).set({
      brief: null,
      copy: null,
      inputSnapshot: null,
      updatedAt: sql`greatest(${creativeWorkItems.updatedAt} + interval '1 millisecond', now())`,
    }).where(and(
      eq(creativeWorkItems.workspaceId, workspaceId),
      eq(creativeWorkItems.id, workItemId),
    )).returning();
    return row;
  });
}

/** Workspace-scoped list for canonical queries (Phase 2). No cross-tenant leak. */
export async function listCreativeWorks(
  workspaceId: string,
  limit?: number
): Promise<CreativeWorkItem[]> {
  const query = db
    .select()
    .from(creativeWorkItems)
    .where(eq(creativeWorkItems.workspaceId, workspaceId))
    .orderBy(desc(creativeWorkItems.updatedAt));
  return typeof limit === "number" ? query.limit(limit) : query;
}

/**
 * Same as listCreativeWorks, but attaches real outputs so list/open share
 * identical projection rules (no synthetic rows).
 */
export async function listCreativeWorksWithOutputs(
  workspaceId: string,
  limit?: number
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

export async function confirmCreativeWorkSnapshotsIfUnchanged(
  workspaceId: string,
  workItemId: string,
  expectedUpdatedAt: Date,
  inputSnapshot: CreativeWorkInputSnapshot,
  identitySnapshot: CreativeWorkIdentitySnapshot,
  executor: Pick<typeof db, "update"> = db,
): Promise<CreativeWorkItem | null> {
  const [row] = await executor.update(creativeWorkItems).set({
    inputSnapshot,
    identitySnapshot,
    status: "ready",
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
    eq(creativeWorkItems.status, "draft"),
    sql`date_trunc('milliseconds', ${creativeWorkItems.updatedAt}) = cast(${expectedUpdatedAt.toISOString()} as timestamp without time zone)`,
  )).returning();
  return row ?? null;
}

export async function setCreativeWorkInputSnapshotIfMissing(
  workspaceId: string,
  workItemId: string,
  inputSnapshot: CreativeWorkInputSnapshot,
): Promise<CreativeWorkItem | null> {
  const [row] = await db.update(creativeWorkItems).set({ inputSnapshot, updatedAt: new Date() }).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
    eq(creativeWorkItems.status, "ready"),
    isNull(creativeWorkItems.inputSnapshot),
  )).returning();
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
  const [work] = await db.select({ generationCorrelationId: creativeWorkItems.generationCorrelationId })
    .from(creativeWorkItems)
    .where(and(eq(creativeWorkItems.workspaceId, workspaceId), eq(creativeWorkItems.id, workItemId)))
    .limit(1);
  if (!work) return [];
  const now = new Date();
  const seedRows = CREATIVE_LEVELS.map((creativeLevel) => ({
    workspaceId,
    workItemId,
    generationCorrelationId: work.generationCorrelationId,
    creativeLevel,
    targetFormat,
    versionNumber: 1,
    operationKey: `${creativeLevel}:${targetFormat}:1`,
    status: "queued" as const,
    isSelected: false,
    createdAt: now,
    queuedAt: now,
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

export type { CreativeWorkOutputPlan } from "../creative-work/contracts";

export async function createPlannedCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  plans: CreativeWorkOutputPlan[],
  executor: Pick<typeof db, "select" | "insert"> = db,
): Promise<{ outputs: CreativeWorkOutput[]; newlyCreatedIds: string[] }> {
  if (plans.length === 0) return { outputs: [], newlyCreatedIds: [] };
  const [work] = await executor.select({
    id: creativeWorkItems.id,
    generationCorrelationId: creativeWorkItems.generationCorrelationId,
  }).from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
  )).limit(1);
  if (!work) return { outputs: [], newlyCreatedIds: [] };
  const now = new Date();
  const inserted = await executor.insert(creativeWorkOutputs).values(plans.map((plan) => {
    const operationKey = plan.directionId
      ? `${plan.creativeLevel}:${plan.targetFormat}:1:direction:${plan.directionId}`
      : `${plan.creativeLevel}:${plan.targetFormat}:1`;
    return {
      workspaceId,
      workItemId,
      generationCorrelationId: work.generationCorrelationId,
      creativeLevel: plan.creativeLevel,
      targetFormat: plan.targetFormat,
      versionNumber: 1,
      operationKey,
      status: "queued" as const,
      isSelected: false,
      directionId: plan.directionId ?? null,
      directionSnapshot: plan.directionSnapshot ?? null,
      createdAt: now,
      queuedAt: now,
      updatedAt: now,
    };
  })).onConflictDoNothing().returning({ id: creativeWorkOutputs.id });
  const outputs = await executor.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
  )).orderBy(asc(creativeWorkOutputs.targetFormat), asc(creativeWorkOutputs.creativeLevel), asc(creativeWorkOutputs.versionNumber));
  return { outputs, newlyCreatedIds: inserted.map((row) => row.id) };
}

/**
 * Claims initial outputs only while the frozen ready revision is still the
 * current work. The validation and insert share the prepare/source lock, so
 * an edit that reopens the retry cannot settle a stale prepared revision.
 */
export async function reservePreparedCreativeWorkOutputsIfCurrent(input: {
  workspaceId: string;
  workItemId: string;
  preparedRevision: Date;
  plans: CreativeWorkOutputPlan[];
}): Promise<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[]; newlyCreatedIds: string[] } | null> {
  return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (tx) => {
    const aggregate = await getCreativeWork(input.workspaceId, input.workItemId, tx);
    if (!aggregate || aggregate.outputs.length !== 0 || aggregate.work.status !== "ready") return null;
    if (aggregate.work.updatedAt.getTime() !== input.preparedRevision.getTime()) return null;
    if (!aggregate.work.brief || !aggregate.work.copy || !aggregate.work.inputSnapshot || !aggregate.work.identitySnapshot) return null;
    const created = await createPlannedCreativeWorkOutputs(
      input.workspaceId,
      input.workItemId,
      input.plans,
      tx,
    );
    return { work: aggregate.work, ...created };
  });
}

/**
 * The only initial-generation reservation path.  Preparation confirmation,
 * legacy snapshot backfill and output reservation share the source/prepare
 * lock, so none can settle a revision that changed between the first read and
 * billing.
 */
export async function reserveCreativeWorkGenerationOutputs(input: {
  workspaceId: string;
  workItemId: string;
  preparedRevision: Date;
  plans: CreativeWorkOutputPlan[];
  identitySnapshot?: CreativeWorkIdentitySnapshot;
  legacyInputSnapshot?: CreativeWorkInputSnapshot;
}): Promise<{ work: CreativeWorkItem; outputs: CreativeWorkOutput[]; newlyCreatedIds: string[] } | null> {
  return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (tx) => {
    let aggregate = await getCreativeWork(input.workspaceId, input.workItemId, tx);
    if (!aggregate || aggregate.outputs.length !== 0 || aggregate.work.updatedAt.getTime() !== input.preparedRevision.getTime()) return null;

    if (aggregate.work.status === "draft") {
      if (!aggregate.work.brief || !aggregate.work.copy || !aggregate.work.inputSnapshot || !input.identitySnapshot) return null;
      const [confirmed] = await tx.update(creativeWorkItems).set({
        identitySnapshot: input.identitySnapshot,
        status: "ready",
        updatedAt: new Date(),
      }).where(and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId),
        eq(creativeWorkItems.status, "draft"),
        workRevisionMatches(input.preparedRevision),
      )).returning();
      if (!confirmed) return null;
      aggregate = await getCreativeWork(input.workspaceId, input.workItemId, tx);
      if (!aggregate) return null;
    }

    if (aggregate.work.status !== "ready" || !aggregate.work.brief || !aggregate.work.copy || !aggregate.work.identitySnapshot) return null;
    if (!aggregate.work.inputSnapshot) {
      if (!input.legacyInputSnapshot) return null;
      const [backfilled] = await tx.update(creativeWorkItems).set({
        inputSnapshot: input.legacyInputSnapshot,
        updatedAt: new Date(),
      }).where(and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId),
        eq(creativeWorkItems.status, "ready"),
        isNull(creativeWorkItems.inputSnapshot),
      )).returning();
      if (!backfilled) return null;
      aggregate = await getCreativeWork(input.workspaceId, input.workItemId, tx);
      if (!aggregate) return null;
    }

    if (aggregate.outputs.length !== 0 || aggregate.work.status !== "ready" || !aggregate.work.inputSnapshot || !aggregate.work.identitySnapshot) return null;
    const created = await createPlannedCreativeWorkOutputs(input.workspaceId, input.workItemId, input.plans, tx);
    return { work: aggregate.work, ...created };
  });
}

export async function deleteQueuedCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  outputIds: string[],
): Promise<void> {
  if (outputIds.length === 0) return;
  await db.delete(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    inArray(creativeWorkOutputs.id, outputIds),
    eq(creativeWorkOutputs.status, "queued"),
  ));
}

export async function createCreativeWorkRevision(
  workspaceId: string,
  workItemId: string,
  revisionKey: string,
  parentOutputId: string,
  instruction: string,
  revisionAssetId: string | null,
): Promise<{ output: CreativeWorkOutput; claimedForDispatch: boolean } | null> {
  const matchesCommand = (output: CreativeWorkOutput) =>
    output.parentOutputId === parentOutputId
    && output.revisionInstruction === instruction
    && output.revisionAssetId === revisionAssetId;

  const [parent] = await db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, parentOutputId),
  )).limit(1);
  if (!parent) return null;

  // Revisions keep the parent direction for identity and versioning, while
  // the operation key remains global so a revision key cannot be replayed
  // against another parent and charge twice.
  const operationKey = `revision:${revisionKey}`;
  const [existing] = await db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.operationKey, operationKey),
  )).limit(1);
  if (existing) return matchesCommand(existing) ? { output: existing, claimedForDispatch: false } : null;

  if (revisionAssetId) {
    const [asset] = await db.select({ id: workspaceAssets.id, type: workspaceAssets.type }).from(workspaceAssets).where(and(
      eq(workspaceAssets.workspaceId, workspaceId),
      eq(workspaceAssets.id, revisionAssetId),
    )).limit(1);
    if (!asset?.type.startsWith("image/")) return null;
  }
  return db.transaction(async (tx) => {
    const versionScope = creativeWorkVersionLockScope({ workspaceId, workItemId, creativeLevel: parent.creativeLevel, targetFormat: parent.targetFormat, directionId: parent.directionId });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${versionScope}))`);

    const [retry] = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, workspaceId),
      eq(creativeWorkOutputs.workItemId, workItemId),
      eq(creativeWorkOutputs.operationKey, operationKey),
    )).limit(1);
    if (retry) return matchesCommand(retry) ? { output: retry, claimedForDispatch: false } : null;

    const [latest] = await tx.select({ maxVersion: max(creativeWorkOutputs.versionNumber) })
      .from(creativeWorkOutputs)
      .where(and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.creativeLevel, parent.creativeLevel),
        eq(creativeWorkOutputs.targetFormat, parent.targetFormat),
        ...(parent.directionId ? [eq(creativeWorkOutputs.directionId, parent.directionId)] : []),
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
      operationKey,
      status: "queued",
      isSelected: false,
      directionId: parent.directionId ?? null,
      directionSnapshot: parent.directionSnapshot ?? null,
      queuedAt: new Date(),
    }).onConflictDoNothing().returning();
    if (row) return { output: row, claimedForDispatch: true };

    const [conflict] = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, workspaceId),
      eq(creativeWorkOutputs.workItemId, workItemId),
      eq(creativeWorkOutputs.operationKey, operationKey),
    )).limit(1);
    if (!conflict) throw new Error("creative_work_revision_conflict_without_row");
    return matchesCommand(conflict) ? { output: conflict, claimedForDispatch: false } : null;
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

export async function requeueCreativeWorkOutputOnce(workspaceId: string, workItemId: string, outputId: string): Promise<CreativeWorkOutput | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
    status: "queued",
    failureCode: null,
    retryCount: sql`${creativeWorkOutputs.retryCount} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
    eq(creativeWorkOutputs.status, "processing"),
    eq(creativeWorkOutputs.retryCount, 0),
  )).returning();
  return row ?? null;
}

/**
 * Absolute ceiling of provider image calls over the output row's lifetime:
 * the normal generation plus one corrective/transport second call.
 * `imageCallCount` is the sole authority for provider calls; `retryCount`
 * keeps counting requeues/commands.
 */
export const CREATIVE_WORK_MAX_IMAGE_CALLS = 2;

/**
 * Atomically claims one provider image call for the output. The guarded
 * UPDATE only matches while `image_call_count < CREATIVE_WORK_MAX_IMAGE_CALLS`,
 * so once the counter reaches the ceiling the claim fails here — before the
 * provider is reached — returning null without side effects.
 * Intentionally status-agnostic: the transport-retry second call must be
 * claimable within the same processing session; do not add a status guard.
 */
export async function claimCreativeWorkOutputImageCall(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<CreativeWorkOutput | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
    imageCallCount: sql`${creativeWorkOutputs.imageCallCount} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
    lt(creativeWorkOutputs.imageCallCount, CREATIVE_WORK_MAX_IMAGE_CALLS),
  )).returning();
  return row ?? null;
}

export async function linkCreativeWorkCampaign(workspaceId: string, workItemId: string, campaignId: string | null): Promise<CreativeWorkItem | null> {
  const [work] = await db.select().from(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.id, workItemId),
  )).limit(1);
  if (!work) return null;
  if (campaignId) {
    const campaign = await getCampaignById(campaignId, workspaceId);
    if (!campaign) return null;
    if (campaign.clientProfileId && campaign.clientProfileId !== work.clientProfileId) return null;
  }
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
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "queued")
      )
    )
    .returning();
  return row ?? null;
}

export async function countCreativeWorkProcessingOutputs(
  workspaceId: string,
  workItemId: string,
  generationCorrelationId?: string,
): Promise<number> {
  const conditions = [
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.status, "processing"),
    ...(generationCorrelationId
      ? [eq(creativeWorkOutputs.generationCorrelationId, generationCorrelationId)]
      : []),
  ];
  const [row] = await db
    .select({ count: count() })
    .from(creativeWorkOutputs)
    .where(and(...conditions));
  return Number(row?.count ?? 0);
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
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "processing")
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
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "processing")
      )
    )
    .returning();
  return row ?? null;
}

/**
 * R-007 lease heartbeat: touches `updatedAt` ONLY while this job still owns
 * the output (`status = processing`). Returns null when the lease was lost —
 * the caller must abort before any further provider call or commit instead
 * of completing/failing a row it no longer owns.
 */
export async function touchCreativeWorkOutputHeartbeat(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "processing")
      )
    )
    .returning();
  return row ?? null;
}

export async function failQueuedCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  failureCode: string,
): Promise<CreativeWorkOutput | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
    status: "failed",
    failureCode,
    terminalAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
    eq(creativeWorkOutputs.status, "queued"),
  )).returning();
  return row ?? null;
}

/**
 * Cancels a still-live output without changing the output contract to a new
 * durable status: cancellation is a terminal failed row with its own cause,
 * while telemetry carries the explicit `canceled` outcome. The status guard
 * makes concurrent completion/cancellation idempotent.
 */
export async function cancelCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<CreativeWorkOutput | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
    status: "failed",
    failureCode: "generation_canceled",
    terminalAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
    inArray(creativeWorkOutputs.status, ["queued", "processing"]),
  )).returning();
  return row ?? null;
}

export async function failStaleQueuedCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  staleBefore: Date,
): Promise<CreativeWorkOutput[]> {
  return db
    .update(creativeWorkOutputs)
    .set({
      status: "failed",
      failureCode: "generation_timeout",
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.status, "queued"),
        sql`${creativeWorkOutputs.updatedAt} < cast(${staleBefore} as timestamp without time zone)`,
      ),
    )
    .returning();
}

export async function failStaleProcessingCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  staleBefore: Date,
): Promise<CreativeWorkOutput[]> {
  return db
    .update(creativeWorkOutputs)
    .set({
      status: "failed",
      failureCode: "generation_timeout",
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.status, "processing"),
        sql`${creativeWorkOutputs.updatedAt} < cast(${staleBefore} as timestamp without time zone)`,
      ),
    )
    .returning();
}

/**
 * Reconciles jobs that disappeared after dispatch (for example, a worker
 * serialization crash). Once the lease expires the output becomes terminal,
 * which lets the UI offer its existing retry action instead of polling forever.
 * Prefer the status-specific helpers above for distinct queued/processing leases.
 */
export async function failStaleCreativeWorkOutputs(
  workspaceId: string,
  workItemId: string,
  staleBefore: Date,
): Promise<CreativeWorkOutput[]> {
  const [queued, processing] = await Promise.all([
    failStaleQueuedCreativeWorkOutputs(workspaceId, workItemId, staleBefore),
    failStaleProcessingCreativeWorkOutputs(workspaceId, workItemId, staleBefore),
  ]);
  return [...queued, ...processing];
}

/** Updates failureCode on an already-failed output (e.g. refund-pending → settled). */
export async function markCreativeWorkOutputFailureCode(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  failureCode: string,
): Promise<CreativeWorkOutput | null> {
  const [row] = await db
    .update(creativeWorkOutputs)
    .set({
      failureCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "failed"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Failed outputs whose compensatory refund still needs a retry. */
export async function listCreativeWorkOutputsNeedingRefund(
  workspaceId: string,
  workItemId: string,
): Promise<CreativeWorkOutput[]> {
  return db
    .select()
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.status, "failed"),
        sql`${creativeWorkOutputs.failureCode} like '%_refund_pending'`,
      ),
    );
}

/** Releases source analyses whose worker event disappeared after dispatch. */
export async function failStaleCreativeWorkSources(
  workspaceId: string,
  workItemId: string,
  staleBefore: Date,
): Promise<CreativeWorkSource[]> {
  return db
    .update(creativeWorkSources)
    .set({
      status: "failed",
      failureCode: "analysis_timeout",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkSources.workspaceId, workspaceId),
        eq(creativeWorkSources.workItemId, workItemId),
        inArray(creativeWorkSources.status, ["uploaded", "analyzing"]),
        sql`${creativeWorkSources.updatedAt} < cast(${staleBefore} as timestamp without time zone)`,
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

export interface CreativeWorkGenerationAggregateSnapshot {
  generationCorrelationId: string;
  unitCount: number;
  terminalCount: number;
  successCount: number;
  failureCount: number;
  result: "partial" | "completed" | "failed";
  firstTerminalAt: string;
  completedAt?: string;
  timeToFirstOutputMs: number;
  totalDurationMs?: number;
  firstTerminalEmitted: boolean;
  completionEmitted: boolean;
}

/**
 * Records the generation-level first/last terminal markers with CAS guards.
 * The first output in a correlation is the durable aggregate anchor, so a
 * revision can have its own generation without sharing the work-item markers.
 */
export async function recordCreativeWorkGenerationAggregate(
  workspaceId: string,
  workItemId: string,
  generationCorrelationId?: string,
): Promise<CreativeWorkGenerationAggregateSnapshot | null> {
  return db.transaction(async (tx) => {
    const [work] = await tx
      .select({
        generationCorrelationId: creativeWorkItems.generationCorrelationId,
      })
      .from(creativeWorkItems)
      .where(and(
        eq(creativeWorkItems.workspaceId, workspaceId),
        eq(creativeWorkItems.id, workItemId),
      ));
    if (!work) return null;
    const correlationId = generationCorrelationId ?? work.generationCorrelationId;

    const outputs = await tx
      .select({
        id: creativeWorkOutputs.id,
        status: creativeWorkOutputs.status,
        createdAt: creativeWorkOutputs.createdAt,
        queuedAt: creativeWorkOutputs.queuedAt,
        updatedAt: creativeWorkOutputs.updatedAt,
        terminalAt: creativeWorkOutputs.terminalAt,
        generationFirstTerminalAt: creativeWorkOutputs.generationFirstTerminalAt,
        generationCompletedAt: creativeWorkOutputs.generationCompletedAt,
      })
      .from(creativeWorkOutputs)
      .where(and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.generationCorrelationId, correlationId),
      ));
    const terminalOutputs = outputs.filter((output) =>
      output.status === "completed" || output.status === "failed"
    );
    if (terminalOutputs.length === 0) return null;
    const anchor = outputs.reduce(
      (earliest, output) => output.createdAt < earliest.createdAt ? output : earliest,
      outputs[0]!,
    );

    const terminalAt = (output: (typeof terminalOutputs)[number]) =>
      output.terminalAt ?? output.updatedAt;
    const calculatedFirstTerminalAt = terminalOutputs.reduce(
      (earliest, output) => terminalAt(output) < earliest ? terminalAt(output) : earliest,
      terminalAt(terminalOutputs[0]!),
    );
    const generationStartedAt = outputs.reduce(
      (earliest, output) => {
        const queuedAt = output.queuedAt ?? output.createdAt ?? output.updatedAt;
        return queuedAt < earliest ? queuedAt : earliest;
      },
      outputs[0]!.queuedAt ?? outputs[0]!.createdAt ?? outputs[0]!.updatedAt,
    );
    const firstTerminal = await tx
      .update(creativeWorkOutputs)
      .set({ generationFirstTerminalAt: calculatedFirstTerminalAt })
      .where(and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, anchor.id),
        isNull(creativeWorkOutputs.generationFirstTerminalAt),
      ))
      .returning({ id: creativeWorkOutputs.id });

    const terminalCount = terminalOutputs.length;
    const successCount = terminalOutputs.filter((output) => output.status === "completed").length;
    const failureCount = terminalOutputs.filter((output) => output.status === "failed").length;
    const allTerminal = terminalCount === outputs.length;
    const calculatedCompletedAt = allTerminal
      ? terminalOutputs.reduce(
          (latest, output) => terminalAt(output) > latest ? terminalAt(output) : latest,
          terminalAt(terminalOutputs[0]!),
        )
      : null;
    const completion = allTerminal && calculatedCompletedAt && !anchor.generationCompletedAt
      ? await tx
          .update(creativeWorkOutputs)
          .set({ generationCompletedAt: calculatedCompletedAt })
          .where(and(
            eq(creativeWorkOutputs.workspaceId, workspaceId),
            eq(creativeWorkOutputs.workItemId, workItemId),
            eq(creativeWorkOutputs.id, anchor.id),
            isNull(creativeWorkOutputs.generationCompletedAt),
          ))
          .returning({ id: creativeWorkOutputs.id })
      : [];

    const firstTerminalAt = anchor.generationFirstTerminalAt ?? calculatedFirstTerminalAt;
    const completedAt = anchor.generationCompletedAt
      ?? (completion.length > 0 ? calculatedCompletedAt : undefined);
    const result = !allTerminal
      ? "partial"
      : failureCount === 0
        ? "completed"
        : successCount === 0
          ? "failed"
          : "partial";

    return {
      generationCorrelationId: correlationId,
      unitCount: outputs.length,
      terminalCount,
      successCount,
      failureCount,
      result,
      firstTerminalAt: firstTerminalAt.toISOString(),
      completedAt: completedAt?.toISOString(),
      timeToFirstOutputMs: Math.max(0, firstTerminalAt.getTime() - generationStartedAt.getTime()),
      totalDurationMs: completedAt
        ? Math.max(0, completedAt.getTime() - generationStartedAt.getTime())
        : undefined,
      firstTerminalEmitted: firstTerminal.length > 0,
      completionEmitted: completion.length > 0,
    };
  });
}

/**
 * Atomic selection: locks every output for the work item before validating
 * Layerize state and changing the selection. Layerize claims the same output
 * row, so the row locks serialize selection with the pre-submit claim.
 * Relies on the unique partial index on `is_selected = true` per work item to
 * keep the invariant.
 */
export async function selectCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  options: { confirmObjective?: boolean } = {}
): Promise<CreativeWorkOutput | null> {
  return db.transaction(async (tx) => {
    const outputs = await tx
      .select()
      .from(creativeWorkOutputs)
      .where(and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
      ))
      .orderBy(asc(creativeWorkOutputs.id))
      .for("update");
    const candidate = outputs.find((output) => output.id === outputId);

    if (
      !candidate ||
      candidate.status !== "completed" ||
      !candidate.outputKey
    ) {
      return null;
    }

    if (outputs.some((output) => (
      output.id !== outputId
      && isLayerizationSelectionLocked(layerizationStateFromDatabase(output.layerization))
    ))) {
      return null;
    }

    const policy = getCreativeWorkSelectionPolicy(candidate.quality);
    if (!policy.selectable || (policy.requiresConfirmation && !options.confirmObjective)) {
      return null;
    }

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
          eq(creativeWorkOutputs.id, outputId),
          eq(creativeWorkOutputs.status, "completed"),
          isNotNull(creativeWorkOutputs.outputKey)
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
 *
 * R-006: the durable budget guard (`image_call_count <
 * CREATIVE_WORK_MAX_IMAGE_CALLS`) makes the CAS itself reject retries whose
 * provider-call budget is already exhausted — defense in depth behind the
 * application-level eligibility check in `retryCreativeWorkOutput`.
 */
export async function requeueFailedCreativeWorkOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  expectedRetryCount: number,
  expectedManualRetryAttempt?: number | null,
): Promise<CreativeWorkOutput | null> {
  const [reset] = await db
    .update(creativeWorkOutputs)
    .set({
      status: "queued",
      failureCode: null,
      terminalAt: null,
      retryCount: sql`${creativeWorkOutputs.retryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
        eq(creativeWorkOutputs.id, outputId),
        eq(creativeWorkOutputs.status, "failed"),
        eq(creativeWorkOutputs.retryCount, expectedRetryCount),
        expectedManualRetryAttempt === undefined
          ? undefined
          : expectedManualRetryAttempt === null
            ? isNull(creativeWorkOutputs.manualRetryAttempt)
            : eq(creativeWorkOutputs.manualRetryAttempt, expectedManualRetryAttempt),
        lt(creativeWorkOutputs.imageCallCount, CREATIVE_WORK_MAX_IMAGE_CALLS)
      )
    )
    .returning();
  return reset ?? null;
}

/**
 * Reserves a durable manual billing ordinal before a reactivation debit.  The
 * status stays failed until the debit is accepted; duplicate clicks either
 * join the same idempotency key or lose this CAS.
 */
export async function claimCreativeWorkOutputManualRetryAttempt(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  expectedRetryCount: number,
  expectedManualRetryAttempt: number | null,
  nextManualRetryAttempt: number,
): Promise<CreativeWorkOutput | null> {
  // A no-op ordinal update cannot establish ownership. Recovered charges join
  // through the queued-state CAS instead; only a new ordinal is claimable.
  if (expectedManualRetryAttempt === nextManualRetryAttempt) return null;
  const [claimed] = await db.update(creativeWorkOutputs).set({
    manualRetryAttempt: nextManualRetryAttempt,
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
    eq(creativeWorkOutputs.status, "failed"),
    eq(creativeWorkOutputs.retryCount, expectedRetryCount),
    expectedManualRetryAttempt === null
      ? isNull(creativeWorkOutputs.manualRetryAttempt)
      : eq(creativeWorkOutputs.manualRetryAttempt, expectedManualRetryAttempt),
    lt(creativeWorkOutputs.imageCallCount, CREATIVE_WORK_MAX_IMAGE_CALLS),
  )).returning();
  return claimed ?? null;
}

/** Releases an uncharged reservation; never touches queued/processing rows. */
export async function releaseCreativeWorkOutputManualRetryAttempt(
  workspaceId: string, workItemId: string, outputId: string, retryCount: number, reservedAttempt: number,
): Promise<CreativeWorkOutput | null> {
  const [released] = await db.update(creativeWorkOutputs).set({ manualRetryAttempt: null, updatedAt: new Date() }).where(and(
    eq(creativeWorkOutputs.workspaceId, workspaceId), eq(creativeWorkOutputs.workItemId, workItemId), eq(creativeWorkOutputs.id, outputId),
    eq(creativeWorkOutputs.status, "failed"), eq(creativeWorkOutputs.retryCount, retryCount), eq(creativeWorkOutputs.manualRetryAttempt, reservedAttempt),
  )).returning();
  return released ?? null;
}
