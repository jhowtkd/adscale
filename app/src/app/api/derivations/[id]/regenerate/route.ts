import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { getTranslations } from "next-intl/server";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getDerivationById,
  createDerivation,
  getActiveChildrenByParent,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { refreshCampaignStatus, updateCampaign, getCampaignById } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { getLatestOpenFeedbackReportForDerivation } from "@/server/repositories/feedback";
import { inngest } from "@/server/jobs/client";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { resolveCtaSemantics } from "@/server/ai/creative-contract";
import type { CreativeContract } from "@/server/ai/creative-contract";
import {
  buildRegenerationCorrectionBrief,
  mergeUserRegenerationNotes,
} from "@/server/ai/regeneration-correction-brief";
import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";
import { recordCampaignMemoryEntry } from "@/server/memory/campaign-memory-context";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";
import { extractRegenerationReason } from "@/server/output-learning/output-decision-reasons";

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

function parseScoreIssues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

async function resolveRegenerationBrief(
  original: {
    id: string;
    regenerationSuggestion?: string | null;
    hardFailures?: unknown;
    scoreIssues?: unknown;
    qaChecklist?: unknown;
    ctaText?: string | null;
    format?: string | null;
    generationMode?: string | null;
    styleAssetId?: string | null;
    creativeContract?: CreativeContract | null;
  },
  workspaceId: string,
  explicitFeedback?: string
): Promise<{
  promptFeedback: string | undefined;
  structured: ReturnType<typeof buildRegenerationCorrectionBrief>["structured"];
  primaryReason: string;
}> {
  const hardFailures = parseHardFailures(original.hardFailures);
  const scoreIssues = parseScoreIssues(original.scoreIssues);
  const contract = resolveContractFromDerivation(original);

  const feedbackReport = await getLatestOpenFeedbackReportForDerivation(
    workspaceId,
    original.id
  );

  const brief = buildRegenerationCorrectionBrief({
    contract,
    hardFailures,
    scoreIssues,
    qaChecklist: original.qaChecklist as Record<string, { status?: string; note?: string }> | null,
    feedbackCategory: feedbackReport?.category,
    modelSuggestion: original.regenerationSuggestion?.trim() || undefined,
    parentDerivationId: original.id,
  });

  const mergedFeedback = mergeUserRegenerationNotes(brief.promptFeedback, explicitFeedback);

  if (
    !mergedFeedback.trim() &&
    hardFailures.length === 0 &&
    scoreIssues.length === 0
  ) {
    return {
      promptFeedback: undefined,
      structured: brief.structured,
      primaryReason: brief.primaryReason,
    };
  }

  return {
    promptFeedback: mergedFeedback,
    structured: brief.structured,
    primaryReason: brief.primaryReason,
  };
}

const bodySchema = z.object({
  feedback: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const [locale, body] = await Promise.all([
      getUserLocale(user.id),
      request.json(),
    ]);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }

    const original = await getDerivationById(id, workspace.id);
    if (!original) {
      return apiError("derivationNotFound", 404);
    }

    const resolved = await resolveRegenerationBrief(
      original,
      workspace.id,
      parsed.data.feedback
    );
    const feedback = resolved.promptFeedback;

    const activeChildren = await getActiveChildrenByParent(id, workspace.id);
    if (activeChildren.length > 0) {
      return apiError("derivationRegenerationInProgress", 429);
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "regeneration",
      idempotencyKey: `regeneration:${id}:${feedback ?? ""}`,
      metadata: { sourceDerivationId: id },
    });
    if (creditError) return creditError;

    const parentContract = original.creativeContract ?? null;
    const regenerationCorrectionBrief = feedback
      ? {
          ...resolved.structured,
          promptFeedback: feedback,
        }
      : undefined;

    const newDerivation = await createDerivation({
      campaignId: original.campaignId,
      workspaceId: workspace.id,
      planId: original.planId ?? undefined,
      parentId: id,
      feedback,
      status: "queued",
      generationMode: original.generationMode ?? undefined,
      variantIndex: original.variantIndex ?? undefined,
      ctaText: original.ctaText ?? undefined,
      format: original.format ?? undefined,
      creativeContract: parentContract ?? undefined,
      regenerationCorrectionBrief,
    });

    try {
      await inngest.send({
        name: "derivation.generate",
        data: {
          derivationId: newDerivation.id,
          campaignId: original.campaignId,
          workspaceId: workspace.id,
          locale,
          generationMode: original.generationMode,
          variantIndex: original.variantIndex,
          ctaText: original.ctaText,
          format: original.format,
        },
      });
    } catch (sendErr) {
      logger.error(
        `[regenerate POST] event send FAILED derivationId=${newDerivation.id}`,
        sendErr
      );
      const [, , t] = await Promise.all([
        updateDerivationStatus(newDerivation.id, workspace.id, "failed"),
        refreshCampaignStatus(original.campaignId, workspace.id),
        getTranslations({ locale, namespace: "errors" }),
      ]);
      return NextResponse.json(
        {
          error: t("generationWorkerUnavailable"),
          code: "generationWorkerUnavailable",
        },
        { status: 503 }
      );
    }

    await updateCampaign(original.campaignId, workspace.id, { status: "generating" });

    if (feedback?.trim()) {
      await recordCampaignMemoryEntry(original.campaignId, workspace.id, {
        type: "regeneration_feedback",
        text: feedback.trim().slice(0, 500),
        derivationId: original.id,
      });
    } else if (resolved.primaryReason.trim()) {
      await recordCampaignMemoryEntry(original.campaignId, workspace.id, {
        type: "regeneration_feedback",
        text: resolved.primaryReason.trim().slice(0, 500),
        derivationId: original.id,
      });
    }

    const campaign = await getCampaignById(original.campaignId, workspace.id);

    void recordOutputDecisionEvidenceBestEffort({
      workspaceId: workspace.id,
      userId: user.id,
      clientProfileId: campaign?.clientProfileId ?? null,
      campaignId: original.campaignId,
      derivationId: original.id,
      parentDerivationId: original.id,
      action: "regenerated",
      source: "derivations.regenerate.POST",
      snapshotInput: original,
      snapshotExtras: {
        childDerivationId: newDerivation.id,
        reason: extractRegenerationReason({
          hardFailures: original.hardFailures,
          scoreIssues: original.scoreIssues,
          regenerationSuggestion: original.regenerationSuggestion,
          correctionPrimaryReason: resolved.primaryReason,
          userFeedback: parsed.data.feedback,
        }),
      },
    });

    return NextResponse.json({ derivation: newDerivation }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "derivations.[id].regenerate.POST");
  }
}
