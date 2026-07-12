import { eq, and, desc, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { clientProfiles, clientReferences } from "../db/schema";
import { isWorkspaceAssetKey } from "./asset";
import { isWorkspaceDerivationOutputKey } from "./derivation";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
  BrandTrainingReviewStatus,
} from "../brand-training/contracts";

/** Defaults applied when a training upload is auto-approved without human review. */
const AUTO_APPROVE_CATEGORY: BrandTrainingCategory = "visual_reference";
const AUTO_APPROVE_USAGE_MODE: BrandTrainingUsageMode = "reference";

export type ClientReferenceKind =
  | "style"
  | "product"
  | "layout"
  | "logo"
  | "negative"
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
  trainingCategory: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis;
}

export interface ReviewTrainingReferenceInput {
  trainingCategory: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  analysis: BrandTrainingAnalysis | null;
  reviewStatus: Extract<BrandTrainingReviewStatus, "approved" | "archived">;
  reviewedByUserId: string;
}

export async function createTrainingReference(
  workspaceId: string,
  input: CreateTrainingReferenceInput,
) {
  // Uploads are auto-approved immediately: there is no human-approval UI
  // gate in the product surface. AI analysis may still enrich category /
  // usage / analysis fields asynchronously after create.
  const [row] = await db
    .insert(clientReferences)
    .values({
      workspaceId,
      clientProfileId: input.clientProfileId,
      assetKey: input.assetKey,
      label: input.label,
      kind: "other",
      trainingCategory: AUTO_APPROVE_CATEGORY,
      usageMode: AUTO_APPROVE_USAGE_MODE,
      reviewStatus: "approved",
      reviewedAt: new Date(),
    })
    .returning();
  return row;
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

/**
 * Promote legacy pending_analysis / pending_approval rows to approved so
 * assets uploaded before auto-approval still condition generation without a
 * missing human-review step.
 */
export async function autoApprovePendingTrainingReferences(
  workspaceId: string,
  clientProfileId: string,
) {
  return db
    .update(clientReferences)
    .set({
      trainingCategory: sql`coalesce(${clientReferences.trainingCategory}, ${AUTO_APPROVE_CATEGORY})`,
      usageMode: sql`coalesce(${clientReferences.usageMode}, ${AUTO_APPROVE_USAGE_MODE})`,
      reviewStatus: "approved",
      reviewedAt: sql`coalesce(${clientReferences.reviewedAt}, now())`,
    })
    .where(
      and(
        eq(clientReferences.workspaceId, workspaceId),
        eq(clientReferences.clientProfileId, clientProfileId),
        inArray(clientReferences.reviewStatus, [
          "pending_analysis",
          "pending_approval",
        ]),
      ),
    )
    .returning();
}

export async function recordTrainingAnalysis(
  scope: TrainingReferenceScope,
  analysis: RecordTrainingAnalysisInput,
) {
  // Auto-approve on analysis: human approval was removed from the product
  // surface. Also enrich approved uploads that still lack analysis.
  const [row] = await db
    .update(clientReferences)
    .set({
      trainingCategory: analysis.trainingCategory,
      usageMode: analysis.usageMode,
      trainingAnalysis: analysis.analysis,
      reviewStatus: "approved",
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(clientReferences.workspaceId, scope.workspaceId),
        eq(clientReferences.clientProfileId, scope.clientProfileId),
        eq(clientReferences.id, scope.referenceId),
        or(
          eq(clientReferences.reviewStatus, "pending_analysis"),
          eq(clientReferences.reviewStatus, "pending_approval"),
          and(
            eq(clientReferences.reviewStatus, "approved"),
            isNull(clientReferences.trainingAnalysis),
          ),
        ),
      ),
    )
    .returning();
  return row;
}

export async function reviewTrainingReference(
  scope: TrainingReferenceScope,
  review: ReviewTrainingReferenceInput,
) {
  const [row] = await db
    .update(clientReferences)
    .set({
      trainingCategory: review.trainingCategory,
      usageMode: review.usageMode,
      trainingAnalysis: review.analysis,
      reviewStatus: review.reviewStatus,
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
        ]),
      ),
    )
    .returning();
  return row;
}
