import { and, eq, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { getAssetWithMetadata, getAssetsByCampaign } from "@/server/repositories/asset";
import { spendOrApiError } from "@/server/billing/paywall";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createDerivation,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { inngest } from "@/server/jobs/client";
import { db } from "@/server/db";
import { derivations } from "@/server/db/schema";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

type CampaignAsset = Awaited<ReturnType<typeof getAssetsByCampaign>>[number];

function resolveRestylingBaseAsset(assets: CampaignAsset[]) {
  return (
    assets.find((asset) => asset.role === "base") ??
    assets.find((asset) => asset.role !== "style_reference") ??
    null
  );
}

function resolveRestylingStyleAsset(
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

async function assertNoQueuedDerivations(campaignId: string, workspaceId: string) {
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

  if (existingQueued.length > 0) {
    throw new AssistantActionExecutionError(
      "Derivations already in progress",
      "execution_failed"
    );
  }
}

export async function executeQuickRestyle(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_restyle");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid quick_restyle inputs", "execution_failed");
  }

  const baseAsset = await getAssetWithMetadata(
    parsed.data.baseCreativeId,
    ctx.workspaceId
  );
  if (!baseAsset) {
    throw new AssistantActionExecutionError("Base creative not found", "asset_not_found");
  }

  await assertNoQueuedDerivations(baseAsset.campaignId, ctx.workspaceId);

  const assets = await getAssetsByCampaign(baseAsset.campaignId, ctx.workspaceId);
  const resolvedBase = resolveRestylingBaseAsset(assets);
  if (!resolvedBase || resolvedBase.id !== baseAsset.id) {
    throw new AssistantActionExecutionError(
      "Base creative is not a valid restyling base asset",
      "asset_not_found"
    );
  }

  const styleAsset = resolveRestylingStyleAsset(
    assets,
    parsed.data.styleReferenceId,
    baseAsset.id
  );
  if (!styleAsset) {
    throw new AssistantActionExecutionError(
      "Restyling requires a style reference asset",
      "asset_not_found"
    );
  }

  const creditError = await spendOrApiError({
    workspaceId: ctx.workspaceId,
    action: "restyling",
    amount: 5,
    idempotencyKey: `assistant-action:${ctx.actionId}:quick_restyle`,
    metadata: {
      actionId: ctx.actionId,
      campaignId: baseAsset.campaignId,
      mode: "restyling",
    },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  await updateCampaign(baseAsset.campaignId, ctx.workspaceId, {
    generationMode: "restyling",
  });

  const derivation = await createDerivation({
    campaignId: baseAsset.campaignId,
    workspaceId: ctx.workspaceId,
    status: "queued",
    generationMode: "restyling",
    variantIndex: 0,
    format:
      baseAsset.width && baseAsset.height
        ? `${baseAsset.width}x${baseAsset.height}`
        : "1:1",
    styleAssetId: styleAsset.id,
  });

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId: baseAsset.campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "restyling",
        variantIndex: 0,
        format: derivation.format,
        styleAssetId: styleAsset.id,
        assistantActionId: ctx.actionId,
      },
    });
  } catch (sendErr) {
    logger.error(
      `[executeQuickRestyle] event send FAILED derivationId=${derivation.id}`,
      sendErr
    );
    await updateDerivationStatus(derivation.id, ctx.workspaceId, "failed");
    throw new AssistantActionExecutionError(
      "Failed to queue restyling job",
      "execution_failed"
    );
  }

  await updateCampaign(baseAsset.campaignId, ctx.workspaceId, {
    status: "generating",
  });

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: derivation.id },
    resultSummary: `Restyling queued (${derivation.id})`,
  };
}
