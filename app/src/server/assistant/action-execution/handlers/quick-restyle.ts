import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { restyleCampaign } from "@/server/application/restyle-campaign";
import { getAssetWithMetadata } from "@/server/repositories/asset";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

/**
 * Assistente adapter for restyle — transport + base asset lookup only.
 * Domain rules live in `restyleCampaign` (shared with HTTP).
 */
export async function executeQuickRestyle(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_restyle");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_restyle inputs",
      "execution_failed"
    );
  }

  const baseAsset = await getAssetWithMetadata(
    parsed.data.baseCreativeId,
    ctx.workspaceId
  );
  if (!baseAsset) {
    throw new AssistantActionExecutionError(
      "Base creative not found",
      "asset_not_found"
    );
  }

  const result = await restyleCampaign({
    workspaceId: ctx.workspaceId,
    campaignId: baseAsset.campaignId,
    userId: ctx.userId,
    locale: ctx.locale,
    styleAssetId: parsed.data.styleReferenceId,
    requireBaseAssetId: baseAsset.id,
    // Preserve assistant billing action (distinct from panel image_derivation).
    billingAction: "restyling",
    billingAmount: 5,
    billingIdempotencyKey: `assistant-action:${ctx.actionId}:quick_restyle`,
    billingMetadata: {
      actionId: ctx.actionId,
      campaignId: baseAsset.campaignId,
      mode: "restyling",
    },
    assistantActionId: ctx.actionId,
  });

  if (!result.ok) {
    switch (result.error.code) {
      case "campaign_not_found":
        throw new AssistantActionExecutionError(
          "Campaign not found",
          "campaign_not_found"
        );
      case "derivations_in_progress":
        throw new AssistantActionExecutionError(
          "Derivations already in progress",
          "execution_failed"
        );
      case "missing_base_asset":
      case "invalid_base_asset":
        throw new AssistantActionExecutionError(
          "Base creative is not a valid restyling base asset",
          "asset_not_found"
        );
      case "style_asset_not_found":
      case "missing_style_asset":
        throw new AssistantActionExecutionError(
          "Restyling requires a style reference asset",
          "asset_not_found"
        );
      case "credit_blocked":
        throw new AssistantActionExecutionError(
          "Insufficient credits",
          "credit_blocked"
        );
      case "dispatch_failed":
        throw new AssistantActionExecutionError(
          "Failed to queue restyling job",
          "execution_failed"
        );
      default:
        throw new AssistantActionExecutionError(
          "Restyle failed",
          "execution_failed"
        );
    }
  }

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: result.value.derivation.id },
    resultSummary: `Restyling queued (${result.value.derivation.id})`,
  };
}
