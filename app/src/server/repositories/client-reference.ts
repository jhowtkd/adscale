import { eq, and, desc, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  clientProfiles,
  clientReferences,
  creativeWorkItems,
} from "../db/schema";
import { isWorkspaceAssetKey } from "./asset";
import { isWorkspaceDerivationOutputKey } from "./derivation";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
  BrandTrainingReviewStatus,
  BrandTrainingRejection,
} from "../brand-training/contracts";
import type {
  BrandFontAssetRecord,
  BrandFontReviewStatus,
  StoredBrandFontAsset,
} from "../brand-training/font-assets";

export type ClientReferenceKind =
  | "style"
  | "product"
  | "layout"
  | "logo"
  | "negative"
  | "brand_guide"
  | "other";

export interface CreateClientProfileInput {
  name: string;
  description?: string;
  visualNotes?: string;
  toneNotes?: string;
  constraints?: string;
}

export interface CreateClientReferenceInput {
  clientProfileId: string;
  assetKey: string;
  label: string;
  kind: ClientReferenceKind;
  notes?: string;
  sourceDerivationId?: string;
}

export async function createClientProfile(
  workspaceId: string,
  data: CreateClientProfileInput
) {
  const result = await db
    .insert(clientProfiles)
    .values({
      workspaceId,
      name: data.name,
      description: data.description ?? null,
      visualNotes: data.visualNotes ?? null,
      toneNotes: data.toneNotes ?? null,
      constraints: data.constraints ?? null,
    })
    .returning();
  return result[0];
}

export async function getClientProfiles(workspaceId: string) {
  return db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.workspaceId, workspaceId))
    .orderBy(desc(clientProfiles.updatedAt));
}

export async function getClientProfile(workspaceId: string, id: string) {
  const result = await db
    .select()
    .from(clientProfiles)
    .where(and(eq(clientProfiles.workspaceId, workspaceId), eq(clientProfiles.id, id)))
    .limit(1);
  return result[0] ?? null;
}

export async function deleteEmptyClientProfile(workspaceId: string, id: string) {
  const [deleted] = await db
    .delete(clientProfiles)
    .where(and(
      eq(clientProfiles.workspaceId, workspaceId),
      eq(clientProfiles.id, id),
      isNull(clientProfiles.logoAssetKey),
      sql`coalesce(jsonb_array_length(${clientProfiles.brandFontAssets}), 0) = 0`,
      sql`not exists (select 1 from ${clientReferences} where ${clientReferences.clientProfileId} = ${clientProfiles.id})`,
      sql`not exists (select 1 from ${campaigns} where ${campaigns.clientProfileId} = ${clientProfiles.id})`,
      sql`not exists (select 1 from ${creativeWorkItems} where ${creativeWorkItems.clientProfileId} = ${clientProfiles.id})`,
    ))
    .returning({ id: clientProfiles.id });

  if (deleted) return { status: "deleted" as const };
  return (await getClientProfile(workspaceId, id))
    ? { status: "in_use" as const }
    : { status: "not_found" as const };
}

export async function addBrandFontAsset(
  workspaceId: string,
  clientProfileId: string,
  font: StoredBrandFontAsset,
): Promise<StoredBrandFontAsset | null> {
  const [updated] = await db
    .update(clientProfiles)
    .set({
      brandFontAssets: sql`coalesce(${clientProfiles.brandFontAssets}, '[]'::jsonb) || ${JSON.stringify([font])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(clientProfiles.workspaceId, workspaceId),
      eq(clientProfiles.id, clientProfileId),
      sql`not exists (
        select 1
        from jsonb_array_elements(coalesce(${clientProfiles.brandFontAssets}, '[]'::jsonb)) as existing
        where existing->>'sha256' = ${font.sha256}
      )`,
    ))
    .returning({ id: clientProfiles.id });
  return updated ? font : null;
}

export async function reviewBrandFontAsset(
  workspaceId: string,
  clientProfileId: string,
  assetKey: string,
  reviewStatus: Exclude<BrandFontReviewStatus, "pending_approval">,
  userId: string,
): Promise<BrandFontAssetRecord | null> {
  const decidedAt = new Date().toISOString();
  const decision = reviewStatus === "approved"
    ? { reviewStatus, approvedAt: decidedAt, approvedByUserId: userId }
    : { reviewStatus, archivedAt: decidedAt, archivedByUserId: userId };
  const eligibleStatus = reviewStatus === "approved"
    ? sql`font->>'reviewStatus' = 'pending_approval'`
    : sql`coalesce(font->>'reviewStatus', 'approved') in ('pending_approval', 'approved')`;
  const [updated] = await db
    .update(clientProfiles)
    .set({
      brandFontAssets: sql`(
        select jsonb_agg(
          case when font->>'assetKey' = ${assetKey}
            then font || ${JSON.stringify(decision)}::jsonb
            else font
          end
          order by ordinal
        )
        from jsonb_array_elements(coalesce(${clientProfiles.brandFontAssets}, '[]'::jsonb))
          with ordinality as entries(font, ordinal)
      )`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(clientProfiles.workspaceId, workspaceId),
      eq(clientProfiles.id, clientProfileId),
      sql`exists (
        select 1
        from jsonb_array_elements(coalesce(${clientProfiles.brandFontAssets}, '[]'::jsonb)) as font
        where font->>'assetKey' = ${assetKey}
          and ${eligibleStatus}
      )`,
    ))
    .returning({ fonts: clientProfiles.brandFontAssets });
  return (updated?.fonts ?? []).find((font) => font.assetKey === assetKey) as BrandFontAssetRecord | undefined ?? null;
}

function normalizeClientLabel(value: string): string {
  return value.trim().toLowerCase();
}

/** Resolve linked profile id, then exact client-name match, then the sole workspace profile. */
export async function resolveCampaignClientProfileId(
  workspaceId: string,
  campaign: { clientProfileId: string | null; client: string | null }
): Promise<string | null> {
  if (campaign.clientProfileId) {
    return campaign.clientProfileId;
  }

  const profiles = await getClientProfiles(workspaceId);
  const clientName = campaign.client?.trim();

  if (clientName) {
    const normalized = normalizeClientLabel(clientName);
    const matches = profiles.filter(
      (profile) => normalizeClientLabel(profile.name) === normalized
    );

    if (matches.length === 1) {
      return matches[0].id;
    }
  }

  if (profiles.length === 1) {
    return profiles[0].id;
  }

  return null;
}

export async function createClientReference(
  workspaceId: string,
  data: CreateClientReferenceInput
) {
  const result = await db
    .insert(clientReferences)
    .values({
      workspaceId,
      clientProfileId: data.clientProfileId,
      assetKey: data.assetKey,
      label: data.label,
      kind: data.kind,
      notes: data.notes ?? null,
      sourceDerivationId: data.sourceDerivationId ?? null,
    })
    .returning();
  return result[0];
}

export async function getClientReferences(
  workspaceId: string,
  clientProfileId: string
) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId)
      )
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getClientReferencesByIds(
  workspaceId: string,
  ids: string[]
) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        inArray(clientReferences.id, ids)
      )
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getClientReferencesByIdsForProfile(
  workspaceId: string,
  clientProfileId: string,
  ids: string[],
) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        inArray(clientReferences.id, ids),
        ne(clientReferences.kind, "brand_guide"),
        // Generic legacy references have no training review state; training
        // assets must be explicitly approved before generation can use them.
        or(isNull(clientReferences.reviewStatus), eq(clientReferences.reviewStatus, "approved")),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function isWorkspaceReferenceAssetKey(
  workspaceId: string,
  assetKey: string
) {
  return (
    (await isWorkspaceAssetKey(workspaceId, assetKey)) ||
    (await isWorkspaceDerivationOutputKey(workspaceId, assetKey))
  );
}

export interface CreateTrainingReferenceInput {
  clientProfileId: string;
  assetKey: string;
  label: string;
}

export interface TrainingReferenceScope {
  workspaceId: string;
  clientProfileId: string;
  referenceId: string;
}

export interface RecordTrainingAnalysisInput {
  existingReviewStatus: BrandTrainingReviewStatus;
  trainingCategory: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis;
}

export interface ReviewTrainingReferenceInput {
  trainingCategory: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis | null;
  reviewStatus: Extract<BrandTrainingReviewStatus, "approved" | "archived" | "rejected">;
  rejectionReason?: BrandTrainingRejection | null;
  reviewedByUserId: string;
}

export async function createTrainingReference(
  workspaceId: string,
  input: CreateTrainingReferenceInput,
) {
  const [row] = await db
    .insert(clientReferences)
    .values({
      workspaceId,
      clientProfileId: input.clientProfileId,
      assetKey: input.assetKey,
      label: input.label,
      kind: "other",
      reviewStatus: "pending_analysis",
    })
    .returning();
  return row;
}

export async function deleteTrainingReference(scope: TrainingReferenceScope) {
  const [row] = await db
    .delete(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, scope.workspaceId),
        eq(clientReferences.clientProfileId, scope.clientProfileId),
        eq(clientReferences.id, scope.referenceId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getTrainingReferenceByAssetKey(
  workspaceId: string,
  clientProfileId: string,
  assetKey: string,
) {
  const [row] = await db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        eq(clientReferences.assetKey, assetKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getTrainingReferences(
  workspaceId: string,
  clientProfileId: string,
) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        inArray(clientReferences.reviewStatus, [
          "pending_analysis",
          "pending_approval",
          "approved",
          "archived",
          "rejected",
        ]),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getApprovedTrainingReferences(
  workspaceId: string,
  clientProfileId: string,
) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        eq(clientReferences.reviewStatus, "approved"),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getArchivedTrainingReferences(
  workspaceId: string,
  clientProfileId: string,
) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        eq(clientReferences.reviewStatus, "archived"),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}

export async function getRejectedTrainingReferences(
  workspaceId: string,
  clientProfileId: string,
) {
  return db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        eq(clientReferences.reviewStatus, "rejected"),
      ),
    )
    .orderBy(desc(clientReferences.createdAt));
}

/**
 * Load a single training reference scoped to a workspace+profile+id.
 *
 * Used by the brand-training analyze job to short-circuit on retry: if the
 * row already has analysis (or left the enrichable states), we must avoid
 * re-running the provider call. Returns `null` if the row does not exist.
 */
export async function getTrainingReferenceForAnalysis(
  workspaceId: string,
  clientProfileId: string,
  referenceId: string,
) {
  const rows = await db
    .select()
    .from(clientReferences)
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        eq(clientReferences.id, referenceId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function recordTrainingAnalysis(
  scope: TrainingReferenceScope,
  analysis: RecordTrainingAnalysisInput,
) {
  const [row] = await db
    .update(clientReferences)
    .set({
      trainingCategory: analysis.trainingCategory,
      usageMode: analysis.usageMode,
      trainingAnalysis: analysis.analysis,
      // Reanalysis may enrich a legacy approved row, but must not silently
      // revoke its existing human/legacy availability state.
      reviewStatus:
        analysis.existingReviewStatus === "approved"
          ? "approved"
          : "pending_approval",
    })
    .where(
      and(
        eq(clientReferences.workspaceId, scope.workspaceId),
        eq(clientReferences.clientProfileId, scope.clientProfileId),
        eq(clientReferences.id, scope.referenceId),
        eq(clientReferences.reviewStatus, analysis.existingReviewStatus),
        inArray(clientReferences.reviewStatus, [
          "pending_analysis",
          "pending_approval",
          "approved",
        ]),
        isNull(clientReferences.trainingAnalysis),
      ),
    )
    .returning();
  return row;
}

export async function reviewTrainingReference(
  scope: TrainingReferenceScope,
  review: ReviewTrainingReferenceInput,
) {
  // A status-only legacy decision must not wipe existing AI analysis.
  const preserveAnalysis = review.analysis === null;

  const [row] = await db
    .update(clientReferences)
    .set({
      trainingCategory: review.trainingCategory,
      usageMode: review.usageMode,
      ...(preserveAnalysis ? {} : { trainingAnalysis: review.analysis }),
      reviewStatus: review.reviewStatus,
      rejectionReason: review.rejectionReason ?? null,
      reviewedAt: new Date(),
      reviewedByUserId: review.reviewedByUserId,
    })
    .where(
      and(
        eq(clientReferences.workspaceId, scope.workspaceId),
        eq(clientReferences.clientProfileId, scope.clientProfileId),
        eq(clientReferences.id, scope.referenceId),
        inArray(clientReferences.reviewStatus, [
          "pending_approval",
          "approved",
          "archived",
          "rejected",
        ]),
      ),
    )
    .returning();
  return row;
}
