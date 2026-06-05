import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  campaignAssets,
  campaigns,
  derivations,
  workspaceAssets,
} from "../db/schema";

export type FeedbackAssetRef = {
  kind: "campaign_asset" | "workspace_asset" | "derivation_output";
  id: string;
  key?: string;
};

export class FeedbackValidationError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

export async function validateCampaignOwnership(
  workspaceId: string,
  campaignId: string
): Promise<void> {
  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);

  if (rows.length === 0) {
    throw new FeedbackValidationError(
      "Campaign not found in workspace",
      "invalid_campaign"
    );
  }
}

export async function validateDerivationOwnership(
  workspaceId: string,
  derivationId: string,
  campaignId?: string | null
): Promise<void> {
  const rows = await db
    .select({ id: derivations.id, campaignId: derivations.campaignId })
    .from(derivations)
    .where(
      and(eq(derivations.id, derivationId), eq(derivations.workspaceId, workspaceId))
    )
    .limit(1);

  const derivation = rows[0];
  if (!derivation) {
    throw new FeedbackValidationError(
      "Derivation not found in workspace",
      "invalid_derivation"
    );
  }

  if (campaignId && derivation.campaignId !== campaignId) {
    throw new FeedbackValidationError(
      "Derivation does not belong to campaign",
      "invalid_derivation_campaign"
    );
  }
}

export async function validateAssetRefs(
  workspaceId: string,
  assetRefs: FeedbackAssetRef[]
): Promise<FeedbackAssetRef[]> {
  if (assetRefs.length === 0) return [];

  const campaignAssetIds = assetRefs
    .filter((ref) => ref.kind === "campaign_asset")
    .map((ref) => ref.id);
  const workspaceAssetIds = assetRefs
    .filter((ref) => ref.kind === "workspace_asset")
    .map((ref) => ref.id);
  const derivationOutputIds = assetRefs
    .filter((ref) => ref.kind === "derivation_output")
    .map((ref) => ref.id);

  if (campaignAssetIds.length > 0) {
    const rows = await db
      .select({ id: campaignAssets.id })
      .from(campaignAssets)
      .where(
        and(
          eq(campaignAssets.workspaceId, workspaceId),
          inArray(campaignAssets.id, campaignAssetIds)
        )
      );
    if (rows.length !== campaignAssetIds.length) {
      throw new FeedbackValidationError(
        "One or more campaign assets are invalid",
        "invalid_asset_ref"
      );
    }
  }

  if (workspaceAssetIds.length > 0) {
    const rows = await db
      .select({ id: workspaceAssets.id })
      .from(workspaceAssets)
      .where(
        and(
          eq(workspaceAssets.workspaceId, workspaceId),
          inArray(workspaceAssets.id, workspaceAssetIds)
        )
      );
    if (rows.length !== workspaceAssetIds.length) {
      throw new FeedbackValidationError(
        "One or more workspace assets are invalid",
        "invalid_asset_ref"
      );
    }
  }

  if (derivationOutputIds.length > 0) {
    const rows = await db
      .select({ id: derivations.id })
      .from(derivations)
      .where(
        and(
          eq(derivations.workspaceId, workspaceId),
          inArray(derivations.id, derivationOutputIds)
        )
      );
    if (rows.length !== derivationOutputIds.length) {
      throw new FeedbackValidationError(
        "One or more derivation outputs are invalid",
        "invalid_asset_ref"
      );
    }
  }

  return assetRefs;
}
