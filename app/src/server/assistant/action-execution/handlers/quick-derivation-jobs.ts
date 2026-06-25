import { logger } from "@/lib/logger";
import { assertDerivationApprovable } from "@/server/ai/creative-quality-gate";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { inngest } from "@/server/jobs/client";
import { updateCampaign } from "@/server/repositories/campaign";
import {
  createDerivation,
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

export async function executeQuickFormatAdapt(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_format_adapt");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_format_adapt inputs",
      "execution_failed"
    );
  }

  const source = await getDerivationById(
    parsed.data.sourceDerivationId,
    ctx.workspaceId
  );
  if (!source) {
    throw new AssistantActionExecutionError("Source derivation not found", "derivation_not_found");
  }
  if (!source.outputKey) {
    throw new AssistantActionExecutionError(
      "Source derivation has no output",
      "execution_failed"
    );
  }

  const creditError = await spendCreditsOrApiError({
    workspaceId: ctx.workspaceId,
    action: "image_derivation",
    amount: 5,
    idempotencyKey: `assistant-action:${ctx.actionId}:quick_format_adapt`,
    metadata: {
      actionId: ctx.actionId,
      sourceDerivationId: source.id,
      targetFormat: parsed.data.targetFormat,
    },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  const child = await createDerivation({
    campaignId: source.campaignId,
    workspaceId: ctx.workspaceId,
    planId: source.planId ?? undefined,
    parentId: source.id,
    status: "queued",
    generationMode: "format_adaptation",
    variantIndex: source.variantIndex ?? undefined,
    ctaText: source.ctaText ?? undefined,
    format: parsed.data.targetFormat,
  });

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: child.id,
        campaignId: source.campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "format_adaptation",
        variantIndex: source.variantIndex,
        ctaText: source.ctaText,
        format: parsed.data.targetFormat,
        assistantActionId: ctx.actionId,
      },
    });
  } catch (sendErr) {
    logger.error(
      `[executeQuickFormatAdapt] event send FAILED derivationId=${child.id}`,
      sendErr
    );
    await updateDerivationStatus(child.id, ctx.workspaceId, "failed");
    throw new AssistantActionExecutionError(
      "Failed to queue format adaptation",
      "execution_failed"
    );
  }

  await updateCampaign(source.campaignId, ctx.workspaceId, { status: "generating" });

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: child.id },
    resultSummary: `Format adaptation queued (${child.id})`,
  };
}

export async function executeQuickPackage(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_package");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid quick_package inputs", "execution_failed");
  }

  const source = await getDerivationById(
    parsed.data.sourceDerivationId,
    ctx.workspaceId
  );
  if (!source) {
    throw new AssistantActionExecutionError("Source derivation not found", "derivation_not_found");
  }
  if (source.status !== "approved") {
    throw new AssistantActionExecutionError(
      "Source derivation must be approved",
      "execution_failed"
    );
  }
  if (!source.outputKey) {
    throw new AssistantActionExecutionError(
      "Source derivation missing output",
      "execution_failed"
    );
  }

  const approvable = assertDerivationApprovable(source);
  if (!approvable.ok) {
    throw new AssistantActionExecutionError(
      "Source derivation has hard failures",
      "execution_failed"
    );
  }

  const requestedFormats = [...new Set(parsed.data.formats)];
  const generatableFormats = requestedFormats.filter(
    (format) => format !== source.format
  );

  if (generatableFormats.length === 0) {
    throw new AssistantActionExecutionError(
      "No additional formats to generate",
      "execution_failed"
    );
  }

  const creditError = await spendCreditsOrApiError({
    workspaceId: ctx.workspaceId,
    action: "delivery_package_child",
    amount: generatableFormats.length * 5,
    idempotencyKey: `assistant-action:${ctx.actionId}:quick_package`,
    metadata: {
      actionId: ctx.actionId,
      sourceDerivationId: source.id,
      formats: generatableFormats,
    },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  const firstFormat = generatableFormats[0] as string;
  const child = await createDerivation({
    campaignId: source.campaignId,
    workspaceId: ctx.workspaceId,
    planId: source.planId ?? undefined,
    parentId: source.id,
    status: "queued",
    generationMode: "format_adaptation",
    variantIndex: source.variantIndex ?? undefined,
    ctaText: source.ctaText ?? undefined,
    format: firstFormat,
  });

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: child.id,
        campaignId: source.campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: "format_adaptation",
        variantIndex: source.variantIndex,
        ctaText: source.ctaText,
        format: firstFormat,
        assistantActionId: ctx.actionId,
      },
    });
  } catch (sendErr) {
    logger.error(
      `[executeQuickPackage] event send FAILED derivationId=${child.id}`,
      sendErr
    );
    await updateDerivationStatus(child.id, ctx.workspaceId, "failed");
    throw new AssistantActionExecutionError(
      "Failed to queue package generation",
      "execution_failed"
    );
  }

  await updateCampaign(source.campaignId, ctx.workspaceId, { status: "generating" });

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: child.id },
    resultSummary: `Package format queued (${child.id})`,
  };
}
