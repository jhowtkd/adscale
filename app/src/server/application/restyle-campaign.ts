/**
 * Canonical application command: restyle a campaign creative (Phase 4).
 * HTTP POST /campaigns/[id]/restyle and Assistente quick_restyle adapt transport only.
 *
 * Billing action/key stay adapter-owned (panel vs chat may use different ledgers).
 */
import type { CreditAction } from "@/server/billing/credits";
import type { SpendResult } from "@/server/billing/paywall";
import { restyleCampaignSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import {
  getAssetWithMetadata,
  getAssetsByCampaign,
} from "@/server/repositories/asset";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";
import { campaignHasActiveDerivations } from "@/server/repositories/derivation";
import { getUsageByIdempotencyKey } from "@/server/repositories/usage";

type CampaignAsset = Awaited<ReturnType<typeof getAssetsByCampaign>>[number];

export type RestyleCampaignInput = {
  workspaceId: string;
  userId: string;
  locale?: string;
  /**
   * Panel entry: campaign-scoped.
   * Mutually exclusive with baseCreativeId for the resolution path
   * (baseCreativeId wins when both are set after Assistente resolution).
   */
  campaignId?: string;
  /**
   * Assistente entry: resolve campaignId + require this asset as restyle base.
   * Handlers must not call repositories — pass baseCreativeId only.
   */
  baseCreativeId?: string;
  /** Prefer first of styleAssetIds; optional auto-pick style_reference. */
  styleAssetId?: string;
  /** When provided, every id must belong to the campaign (HTTP multi-select). */
  styleAssetIds?: string[];
  styleIntensity?: "soft" | "medium" | "strong";
  creativeLevel?: "conservative" | "balanced" | "bold" | "extreme";
  billingAction: CreditAction;
  /**
   * Required for panel/HTTP when each click must start a new settlement.
   * Assistant actions pass a stable action-scoped key.
   * When omitted, built from base+style+params+attemptId.
   */
  billingIdempotencyKey?: string;
  /** Distinguishes successive panel restyles that share base/style/params. */
  billingAttemptId?: string;
  billingMetadata?: Record<string, unknown>;
  billingAmount?: number;
  assistantActionId?: string | null;
};

export type RestyleCampaignError =
  | { code: "invalid_input" }
  | { code: "base_creative_not_found" }
  | { code: "campaign_not_found" }
  | { code: "derivations_in_progress" }
  | { code: "missing_base_asset" }
  | { code: "invalid_base_asset" }
  | { code: "style_asset_not_found" }
  | { code: "missing_style_asset" }
  | { code: "credit_blocked"; spend: Extract<SpendResult, { ok: false }> }
  | { code: "dispatch_failed"; derivationId: string };

export type RestyleCampaignSuccess = {
  derivation: import("@/server/generation/settlement-adapters").CampaignDerivationSettlementValue["derivation"];
  baseAsset: CampaignAsset;
  styleAsset: CampaignAsset;
  campaignId: string;
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

export async function restyleCampaign(
  input: RestyleCampaignInput
): Promise<RestyleCampaignResult> {
  let campaignId = input.campaignId;
  let requireBaseAssetId: string | undefined;

  if (input.baseCreativeId) {
    const baseAssetRow = await getAssetWithMetadata(
      input.baseCreativeId,
      input.workspaceId
    );
    if (!baseAssetRow) {
      return { ok: false, error: { code: "base_creative_not_found" } };
    }
    campaignId = baseAssetRow.campaignId;
    requireBaseAssetId = baseAssetRow.id;
  }

  if (!campaignId) {
    return { ok: false, error: { code: "invalid_input" } };
  }

  const campaign = await getCampaignById(campaignId, input.workspaceId);
  if (!campaign) {
    return { ok: false, error: { code: "campaign_not_found" } };
  }

  const assets = await getAssetsByCampaign(campaignId, input.workspaceId);
  const baseAsset = resolveRestylingBaseAsset(assets);
  if (!baseAsset) {
    return { ok: false, error: { code: "missing_base_asset" } };
  }
  if (requireBaseAssetId && baseAsset.id !== requireBaseAssetId) {
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

  const styleParam =
    input.creativeLevel ?? input.styleIntensity ?? "default";
  const attemptId = input.billingAttemptId ?? "0";
  const billingIdempotencyKey =
    input.billingIdempotencyKey ??
    `restyling:${campaignId}:${baseAsset.id}:${styleAsset.id}:${styleParam}:${attemptId}`;

  // Block concurrent work unless this request is an idempotent settlement
  // replay of an in-flight restyle (same billing key already charged).
  if (await campaignHasActiveDerivations(campaignId, input.workspaceId)) {
    const existingCharge = await getUsageByIdempotencyKey(
      input.workspaceId,
      billingIdempotencyKey,
    );
    if (!existingCharge) {
      return { ok: false, error: { code: "derivations_in_progress" } };
    }
  }

  await updateCampaign(campaignId, input.workspaceId, {
    generationMode: "restyling",
    ...(input.creativeLevel
      ? { creativeLevel: input.creativeLevel }
      : input.styleIntensity
        ? { styleIntensity: input.styleIntensity }
        : {}),
  });

  const format =
    baseAsset.width && baseAsset.height
      ? `${baseAsset.width}x${baseAsset.height}`
      : "1:1";

  const billingAmount = input.billingAmount;
  if (billingAmount == null || billingAmount <= 0) {
    return { ok: false, error: { code: "invalid_input" } };
  }

  const settled = await startGenerationSettlement(
    restyleCampaignSettlementAdapter({
      workspaceId: input.workspaceId,
      userId: input.userId,
      campaignId,
      billingKey: billingIdempotencyKey,
      billingAction: input.billingAction,
      billingAmount,
      billingMetadata: input.billingMetadata,
      locale: input.locale,
      assistantActionId: input.assistantActionId,
      styleAssetId: styleAsset.id,
      format,
    }),
  );

  if (!settled.ok) {
    if (settled.error.code === "credit_blocked") {
      const spend: Extract<SpendResult, { ok: false }> = {
        ok: false,
        status: 402,
        conversionPayload: settled.error.details as Extract<
          SpendResult,
          { ok: false }
        >["conversionPayload"],
      };
      return {
        ok: false,
        error: { code: "credit_blocked", spend },
      };
    }
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        derivationId: settled.error.value.derivation.id,
      },
    };
  }

  return {
    ok: true,
    value: {
      derivation: settled.value.derivation,
      baseAsset,
      styleAsset,
      campaignId,
    },
  };
}
