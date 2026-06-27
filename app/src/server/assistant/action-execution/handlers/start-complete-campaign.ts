import { logger } from "@/lib/logger";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { buildPlanPrompt } from "@/server/ai/prompt-builder";
import { getOpenAI } from "@/server/ai/utils";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { inngest } from "@/server/jobs/client";
import { env } from "@/server/validation/env";
import { z } from "zod";
import { getAssetsByCampaign, getAssetWithMetadata } from "@/server/repositories/asset";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";
import {
  createDerivation,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import {
  createPlan,
  getPlanByCampaign,
} from "@/server/repositories/plan";
import { getAssistantThreadById } from "@/server/repositories/assistant-thread";
import { materializeExistingCreativeCampaign } from "@/server/assistant/guided-paths/existing-creative";
import { getGuidedFlowByThread } from "@/server/repositories/guided-flow";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

const planSchema = z.object({
  strategy: z.string(),
  angles: z.array(z.string()),
  hooks: z.array(z.string()),
  ctas: z.array(z.string()),
});

export async function executeStartCompleteCampaign(ctx: ActionExecutionContext) {
  const contract = getActionContract("start_complete_campaign");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid start_complete_campaign inputs",
      "execution_failed"
    );
  }

  let thread = await getAssistantThreadById(ctx.workspaceId, ctx.threadId);
  let baseCreativeId = parsed.data.baseCreativeId;
  if (!thread?.campaignId) {
    const flow = await getGuidedFlowByThread(ctx.workspaceId, ctx.threadId);
    if (flow?.path !== "existing_creative") {
      throw new AssistantActionExecutionError(
        "Complete campaign requires a reviewed creative",
        "scope_mismatch"
      );
    }
    const materialized = await materializeExistingCreativeCampaign({
      workspaceId: ctx.workspaceId,
      threadId: ctx.threadId,
      clientProfileId: ctx.clientProfileId,
      workspaceAssetId: parsed.data.baseCreativeId,
    });
    baseCreativeId = materialized.baseCreativeId;
    thread = await getAssistantThreadById(ctx.workspaceId, ctx.threadId);
  }
  if (!thread?.campaignId) {
    throw new AssistantActionExecutionError("Campaign materialization failed", "scope_mismatch");
  }

  const campaignId = thread.campaignId;
  const campaign = await getCampaignById(campaignId, ctx.workspaceId);
  if (!campaign) {
    throw new AssistantActionExecutionError("Campaign not found", "campaign_not_found");
  }

  const baseAsset = await getAssetWithMetadata(
    baseCreativeId,
    ctx.workspaceId
  );
  if (!baseAsset || baseAsset.campaignId !== campaignId) {
    throw new AssistantActionExecutionError("Base creative not found", "asset_not_found");
  }

  await updateCampaign(campaignId, ctx.workspaceId, {
    product: parsed.data.productOffer,
    audience: parsed.data.audience,
    objective: parsed.data.objective,
    offer: parsed.data.productOffer,
    constraints: parsed.data.constraints,
    targetFormats: [parsed.data.platformOrFormat],
    ctaVariants: [parsed.data.cta],
    generationMode: "art_variation",
    status: "draft",
  });

  let plan = await getPlanByCampaign(campaignId, ctx.workspaceId);
  if (!plan) {
    const creditError = await spendCreditsOrApiError({
      workspaceId: ctx.workspaceId,
      action: "creative_plan",
      idempotencyKey: `assistant-action:${ctx.actionId}:creative_plan`,
      metadata: { actionId: ctx.actionId, campaignId },
      userId: ctx.userId,
    });
    if (creditError) {
      throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
    }

    const updatedCampaign = await getCampaignById(campaignId, ctx.workspaceId);
    const assets = await getAssetsByCampaign(campaignId, ctx.workspaceId);
    const prompt = buildPlanPrompt(updatedCampaign!, assets[0], ctx.locale);
    const completion = await getOpenAI().chat.completions.create({
      model: env.OPENAI_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new AssistantActionExecutionError("Plan generation failed", "execution_failed");
    }

    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1]!.trim() : rawContent.trim();
    let planPayload: z.infer<typeof planSchema>;
    try {
      planPayload = planSchema.parse(JSON.parse(jsonString));
    } catch (error) {
      logger.error("[executeStartCompleteCampaign] invalid plan JSON", error);
      throw new AssistantActionExecutionError("Plan generation failed", "execution_failed");
    }

    plan = await createPlan(campaignId, ctx.workspaceId, planPayload);
  }

  const previewCreditError = await spendCreditsOrApiError({
    workspaceId: ctx.workspaceId,
    action: "image_derivation",
    amount: 5,
    idempotencyKey: `assistant-action:${ctx.actionId}:preview`,
    metadata: { actionId: ctx.actionId, campaignId, preview: true },
    userId: ctx.userId,
  });
  if (previewCreditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  const derivation = await createDerivation({
    campaignId,
    workspaceId: ctx.workspaceId,
    planId: plan.id,
    status: "queued",
    generationMode: "art_variation",
    variantIndex: 0,
    ctaText: parsed.data.cta,
    format: parsed.data.platformOrFormat,
    isPreview: true,
    styleAssetId: parsed.data.styleReferenceId ?? undefined,
  });

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: derivation.id,
        campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "art_variation",
        variantIndex: 0,
        ctaText: parsed.data.cta,
        format: parsed.data.platformOrFormat,
        isPreview: true,
        styleAssetId: parsed.data.styleReferenceId ?? null,
        assistantActionId: ctx.actionId,
      },
    });
  } catch {
    await updateDerivationStatus(derivation.id, ctx.workspaceId, "failed");
    throw new AssistantActionExecutionError(
      "Failed to queue preview generation",
      "execution_failed"
    );
  }

  await updateCampaign(campaignId, ctx.workspaceId, { status: "generating" });

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: derivation.id },
    resultSummary: `Preview generation queued (${derivation.id})`,
    campaignId,
  };
}
