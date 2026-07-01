import { logger } from "@/lib/logger";
import { resolveCtaSemantics } from "@/server/ai/creative-contract";
import type { CreativeContract } from "@/server/ai/creative-contract";
import {
  buildRegenerationCorrectionBrief,
  mergeUserRegenerationNotes,
} from "@/server/ai/regeneration-correction-brief";
import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";
import { getActionContract } from "@/server/assistant/action-contracts/registry";
import { spendOrApiError } from "@/server/billing/paywall";
import { inngest } from "@/server/jobs/client";
import { recordCampaignMemoryEntry } from "@/server/memory/campaign-memory-context";
import { getCampaignById, refreshCampaignStatus, updateCampaign } from "@/server/repositories/campaign";
import {
  createDerivation,
  getDerivationById,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { getLatestOpenFeedbackReportForDerivation } from "@/server/repositories/feedback";
import type { ActionExecutionContext } from "../types";
import { AssistantActionExecutionError } from "../types";

function parseHardFailures(value: unknown): CreativeHardFailure[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CreativeHardFailure =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { code?: unknown }).code === "string" &&
      typeof (item as { message?: unknown }).message === "string"
  );
}

function resolveContractFromDerivation(original: {
  creativeContract?: CreativeContract | null;
  ctaText?: string | null;
  format?: string | null;
  generationMode?: string | null;
  styleAssetId?: string | null;
}): CreativeContract {
  if (original.creativeContract) {
    return original.creativeContract;
  }

  const generationMode = (original.generationMode ??
    "art_variation") as CreativeContract["generationMode"];

  return {
    generationMode,
    targetFormat: original.format ?? "1:1",
    ctaSemantics: resolveCtaSemantics(original.ctaText, generationMode),
    baseAssetId: null,
    styleAssetId: original.styleAssetId ?? null,
    client: null,
    product: null,
    offer: null,
    constraints: null,
  };
}

export async function executeQuickRegenerate(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_regenerate");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid quick_regenerate inputs",
      "execution_failed"
    );
  }

  const original = await getDerivationById(parsed.data.derivationId, ctx.workspaceId);
  if (!original) {
    throw new AssistantActionExecutionError("Derivation not found", "derivation_not_found");
  }

  const creditError = await spendOrApiError({
    workspaceId: ctx.workspaceId,
    action: "regeneration",
    amount: 5,
    idempotencyKey: `assistant-action:${ctx.actionId}:quick_regenerate`,
    metadata: { actionId: ctx.actionId, derivationId: original.id },
    userId: ctx.userId,
  });
  if (creditError) {
    throw new AssistantActionExecutionError("Insufficient credits", "credit_blocked");
  }

  const feedback = parsed.data.feedback?.trim() || undefined;
  const parentContract = resolveContractFromDerivation(original);
  const hardFailures = parseHardFailures(original.hardFailures);
  const feedbackReport = await getLatestOpenFeedbackReportForDerivation(
    ctx.workspaceId,
    original.id
  );
  const brief = buildRegenerationCorrectionBrief({
    contract: parentContract,
    hardFailures,
    scoreIssues: [],
    qaChecklist: original.qaChecklist as Record<
      string,
      { status?: string; note?: string }
    > | null,
    feedbackCategory: feedbackReport?.category,
    modelSuggestion: original.regenerationSuggestion?.trim() || undefined,
    parentDerivationId: original.id,
  });
  const regenerationCorrectionBrief = mergeUserRegenerationNotes(
    brief.promptFeedback,
    feedback
  );

  const newDerivation = await createDerivation({
    campaignId: original.campaignId,
    workspaceId: ctx.workspaceId,
    planId: original.planId ?? undefined,
    parentId: original.id,
    feedback,
    status: "queued",
    generationMode: original.generationMode ?? undefined,
    variantIndex: original.variantIndex ?? undefined,
    ctaText: original.ctaText ?? undefined,
    format: original.format ?? undefined,
    creativeContract: parentContract,
    regenerationCorrectionBrief: (() => {
      const mergedFeedback = mergeUserRegenerationNotes(brief.promptFeedback, feedback);
      return mergedFeedback.trim()
        ? { ...brief.structured, promptFeedback: mergedFeedback }
        : undefined;
    })(),
  });

  try {
    await inngest.send({
      name: "derivation.generate",
      data: {
        derivationId: newDerivation.id,
        campaignId: original.campaignId,
        workspaceId: ctx.workspaceId,
        triggeredByUserId: ctx.userId,
        locale: ctx.locale,
        generationMode: original.generationMode,
        variantIndex: original.variantIndex,
        ctaText: original.ctaText,
        format: original.format,
        assistantActionId: ctx.actionId,
      },
    });
  } catch (sendErr) {
    logger.error(
      `[executeQuickRegenerate] event send FAILED derivationId=${newDerivation.id}`,
      sendErr
    );
    await updateDerivationStatus(newDerivation.id, ctx.workspaceId, "failed");
    await refreshCampaignStatus(original.campaignId, ctx.workspaceId);
    throw new AssistantActionExecutionError(
      "Failed to queue regeneration",
      "execution_failed"
    );
  }

  await updateCampaign(original.campaignId, ctx.workspaceId, { status: "generating" });

  if (feedback) {
    await recordCampaignMemoryEntry(original.campaignId, ctx.workspaceId, {
      type: "regeneration_feedback",
      text: feedback.slice(0, 500),
      derivationId: original.id,
    });
  }

  return {
    mode: "async" as const,
    jobRef: { kind: "derivation" as const, id: newDerivation.id },
    resultSummary: `Regeneration queued (${newDerivation.id})`,
  };
}

export async function executeQuickReview(ctx: ActionExecutionContext) {
  const contract = getActionContract("quick_review");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError("Invalid quick_review inputs", "execution_failed");
  }

  const derivation = await getDerivationById(parsed.data.derivationId, ctx.workspaceId);
  if (!derivation) {
    throw new AssistantActionExecutionError("Derivation not found", "derivation_not_found");
  }

  const status = parsed.data.decision === "entra" ? "approved" : "rejected";

  await updateDerivationStatus(parsed.data.derivationId, ctx.workspaceId, status);
  await refreshCampaignStatus(derivation.campaignId, ctx.workspaceId);

  const campaign = await getCampaignById(derivation.campaignId, ctx.workspaceId);

  return {
    mode: "sync" as const,
    jobRef: { kind: "derivation" as const, id: derivation.id },
    resultSummary: `Review recorded as ${status} for ${campaign?.name ?? "campaign"}`,
  };
}
