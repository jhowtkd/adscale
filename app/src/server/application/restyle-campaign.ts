/**
 * Canonical application command: restyle a campaign creative (Phase 4).
 * HTTP POST /campaigns/[id]/restyle and Assistente quick_restyle adapt transport only.
 *
 * Billing action/key stay adapter-owned (panel vs chat may use different ledgers).
 */
import { and, eq, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { spend, type SpendResult } from "@/server/billing/paywall";
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import type { CreditAction } from "@/server/billing/credits";
import { inngest } from "@/server/jobs/client";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  createDerivation,
  updateDerivationStatus,
} from "@/server/repositories/derivation";

type CampaignAsset = Awaited<ReturnType<typeof getAssetsByCampaign>>[number];

export type RestyleCampaignInput = {
  workspaceId: string;
  campaignId: string;
  userId: string;
  locale?: string;
  /** Prefer first of styleAssetIds; optional auto-pick style_reference. */
  styleAssetId?: string;
  /** When provided, every id must belong to the campaign (HTTP multi-select). */
  styleAssetIds?: string[];
  styleIntensity?: "soft" | "medium" | "strong";
  creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
  /** When set, resolved base must equal this asset id (Assistente baseCreativeId). */
  requireBaseAssetId?: string;
  billingAction: CreditAction;
  /** When omitted, uses historical HTTP key `restyling:{campaignId}:{baseAssetId}`. */
  billingIdempotencyKey?: string;
  billingMetadata?: Record<string, unknown>;
  billingAmount?: number;
  assistantActionId?: string | null;
};

export type RestyleCampaignError =
  | { code: "campaign_not_found" }
  | { code: "derivations_in_progress" }
  | { code: "missing_base_asset" }
  | { code: "invalid_base_asset" }
  | { code: "style_asset_not_found" }
  | { code: "missing_style_asset" }
  | { code: "credit_blocked"; spend: Extract<SpendResult, { ok: false }> }
  | { code: "dispatch_failed"; derivationId: string };

export type RestyleCampaignSuccess = {
  derivation: Awaited<ReturnType<typeof createDerivation>>;
  baseAsset: CampaignAsset;
  styleAsset: CampaignAsset;
};

export type RestyleCampaignResult =
  | { ok: true; value: RestyleCampaignSuccess }
  | { ok: false; error: RestyleCampaignError };

export function resolveRestylingBaseAsset(assets: CampaignAsset[]) {
  return (
    assets.find((asset) => asset.role === "base") ??
    assets.find((asset) => asset.role !== "style_reference") ??
    null
  );
}

export function resolveRestylingStyleAsset(
  assets: CampaignAsset[],
  styleAssetId: string | undefined,
  baseAssetId: string
) {
  if (styleAssetId) {
    const selected = assets.find((asset) => asset.id === styleAssetId);
    if (selected?.role === "style_reference" && selected.id !== baseAssetId) {
      return selected;
    }
    return null;
  }

  return (
    assets.find(
      (asset) => asset.id !== baseAssetId && asset.role === "style_reference"
    ) ?? null
  );
}

async function hasQueuedDerivations(
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
        sql`${derivations.status} IN ('queued', 'processing')`
      )
    )
    .limit(1);
  return existingQueued.length > 0;
}

export async function restyleCampaign(
  input: RestyleCampaignInput
): Promise<RestyleCampaignResult> {
  const campaign = await getCampaignById(input.campaignId, input.workspaceId);
  if (!campaign) {
    return { ok: false, error: { code: "campaign_not_found" } };
  }

  if (await hasQueuedDerivations(input.campaignId, input.workspaceId)) {
    return { ok: false, error: { code: "derivations_in_progress" } };
  }

  const assets = await getAssetsByCampaign(input.campaignId, input.workspaceId);
  const baseAsset = resolveRestylingBaseAsset(assets);
  if (!baseAsset) {
    return { ok: false, error: { code: "missing_base_asset" } };
  }
  if (
    input.requireBaseAssetId &&
    baseAsset.id !== input.requireBaseAssetId
  ) {
    return { ok: false, error: { code: "invalid_base_asset" } };
  }

  const styleIdsToValidate =
    input.styleAssetIds && input.styleAssetIds.length > 0
      ? input.styleAssetIds
      : input.styleAssetId
        ? [input.styleAssetId]
        : [];
  if (styleIdsToValidate.length > 0) {
    const campaignAssetIds = new Set(assets.map((a) => a.id));
    for (const id of styleIdsToValidate) {
      if (!campaignAssetIds.has(id)) {
        return { ok: false, error: { code: "style_asset_not_found" } };
      }
    }
  }

  const selectedStyleId =
    input.styleAssetId ??
    (input.styleAssetIds && input.styleAssetIds.length > 0
      ? input.styleAssetIds[0]
      : undefined);

  const styleAsset = resolveRestylingStyleAsset(
    assets,
    selectedStyleId,
    baseAsset.id
  );
  if (!styleAsset) {
    return { ok: false, error: { code: "missing_style_asset" } };
  }

  await updateCampaign(input.campaignId, input.workspaceId, {
    generationMode: "restyling",
    ...(input.creativeLevel
      ? { creativeLevel: input.creativeLevel }
      : input.styleIntensity
        ? { styleIntensity: input.styleIntensity }
        : {}),
  });

  const billingIdempotencyKey =
    input.billingIdempotencyKey ??
    `restyling:${input.campaignId}:${baseAsset.id}`;

  const spendResult = await spend({
    workspaceId: input.workspaceId,
    action: input.billingAction,
    amount: input.billingAmount,
    idempotencyKey: billingIdempotencyKey,
    metadata: {
      campaignId: input.campaignId,
      mode: "restyling",
      ...input.billingMetadata,
    },
    userId: input.userId,
  });
  if (!spendResult.ok) {
    return {
      ok: false,
      error: { code: "credit_blocked", spend: spendResult },
    };
  }

  const format =
    baseAsset.width && baseAsset.height
      ? `${baseAsset.width}x${baseAsset.height}`
      : "1:1";

  const derivation = await createDerivation({
    campaignId: input.campaignId,
    workspaceId: input.workspaceId,
    status: "queued",
    generationMode: "restyling",
    variantIndex: 0,
    format,
    styleAssetId: styleAsset.id,
  });

  logger.info(
    `[restyleCampaign] created derivationId=${derivation.id} mode=restyling`
  );

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId: input.campaignId,
        workspaceId: input.workspaceId,
        triggeredByUserId: input.userId,
        locale: input.locale,
        generationMode: "restyling",
        variantIndex: 0,
        format: derivation.format,
        styleAssetId: styleAsset.id,
        ...(input.assistantActionId
          ? { assistantActionId: input.assistantActionId }
          : {}),
      },
    });
    logger.info(`[restyleCampaign] event sent derivationId=${derivation.id}`);
  } catch (sendErr) {
    logger.error(
      `[restyleCampaign] event send FAILED derivationId=${derivation.id}`,
      sendErr
    );
    await updateDerivationStatus(
      derivation.id,
      input.workspaceId,
      "failed"
    );
    return {
      ok: false,
      error: { code: "dispatch_failed", derivationId: derivation.id },
    };
  }

  await updateCampaign(input.campaignId, input.workspaceId, {
    status: "generating",
  });

  return {
    ok: true,
    value: { derivation, baseAsset, styleAsset },
  };
}
