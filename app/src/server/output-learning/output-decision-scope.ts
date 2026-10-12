import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clientProfiles, creativeWorkItems, creativeWorkOutputs } from "../db/schema";
import { FeedbackValidationError, validateCampaignOwnership, validateDerivationOwnership } from "../feedback/validate-refs";

export interface OutputDecisionScopeInput {
  workspaceId: string;
  clientProfileId?: string | null;
  campaignId?: string | null;
  derivationId?: string | null;
  creativeWorkOutputId?: string | null;
}

export async function resolveOutputDecisionScope(input: OutputDecisionScopeInput) {
  if (Boolean(input.derivationId) === Boolean(input.creativeWorkOutputId)) {
    throw new FeedbackValidationError("Exactly one Peça reference is required", "invalid_output_reference");
  }
  if (input.derivationId) {
    if (!input.campaignId) {
      throw new FeedbackValidationError("Campaign is required for a legacy derivation", "invalid_campaign");
    }
    await validateCampaignOwnership(input.workspaceId, input.campaignId, input.clientProfileId);
    await validateDerivationOwnership(input.workspaceId, input.derivationId, input.campaignId);
    return {
      clientProfileId: input.clientProfileId ?? null, campaignId: input.campaignId,
      derivationId: input.derivationId, creativeWorkOutputId: null,
    };
  }

  const [scope] = await db.select({
    clientProfileId: creativeWorkItems.clientProfileId, campaignId: creativeWorkItems.campaignId,
  }).from(creativeWorkOutputs).innerJoin(creativeWorkItems, and(
    eq(creativeWorkItems.id, creativeWorkOutputs.workItemId),
    eq(creativeWorkItems.workspaceId, input.workspaceId),
  )).innerJoin(clientProfiles, and(
    eq(clientProfiles.id, creativeWorkItems.clientProfileId),
    eq(clientProfiles.workspaceId, input.workspaceId),
  )).where(and(
    eq(creativeWorkOutputs.id, input.creativeWorkOutputId!),
    eq(creativeWorkOutputs.workspaceId, input.workspaceId),
  )).limit(1);
  if (!scope) {
    throw new FeedbackValidationError("Peça not found in workspace", "invalid_creative_work_output");
  }
  if (input.clientProfileId != null && input.clientProfileId !== scope.clientProfileId) {
    throw new FeedbackValidationError("Peça does not belong to brand", "invalid_creative_work_output_brand");
  }
  if (input.campaignId != null && input.campaignId !== scope.campaignId) {
    throw new FeedbackValidationError("Peça does not belong to campaign", "invalid_creative_work_output_campaign");
  }
  if (scope.campaignId) {
    await validateCampaignOwnership(input.workspaceId, scope.campaignId, scope.clientProfileId);
  }
  return { ...scope, derivationId: null, creativeWorkOutputId: input.creativeWorkOutputId! };
}
