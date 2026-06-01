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
import { refreshCampaignStatus, updateCampaign } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { inngest } from "@/server/jobs/client";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { resolveCtaSemantics } from "@/server/ai/creative-contract";
import type { CreativeContract } from "@/server/ai/creative-contract";
import { buildHardFailureRegenerationSuggestion } from "@/server/ai/creative-score";
import type { CreativeHardFailure } from "@/server/ai/creative-quality-gate";

function resolveRegenerationFeedback(
  original: {
    regenerationSuggestion?: string | null;
    hardFailures?: unknown;
    ctaText?: string | null;
    format?: string | null;
    generationMode?: string | null;
    styleAssetId?: string | null;
  },
  explicitFeedback?: string
): string | undefined {
  const trimmedExplicit = explicitFeedback?.trim();
  if (trimmedExplicit) {
    return trimmedExplicit;
  }

  const storedSuggestion = original.regenerationSuggestion?.trim();
  if (storedSuggestion) {
    return storedSuggestion;
  }

  const hardFailures = Array.isArray(original.hardFailures)
    ? (original.hardFailures as CreativeHardFailure[])
    : [];
  if (hardFailures.length === 0) {
    return undefined;
  }

  const generationMode = (original.generationMode ??
    "art_variation") as CreativeContract["generationMode"];
  const contract: CreativeContract = {
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

  return buildHardFailureRegenerationSuggestion({
    hardFailures: hardFailures.map(({ code, message }) => ({ code, message })),
    contract,
  });
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

    const feedback = resolveRegenerationFeedback(original, parsed.data.feedback);

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

    return NextResponse.json({ derivation: newDerivation }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "derivations.[id].regenerate.POST");
  }
}
