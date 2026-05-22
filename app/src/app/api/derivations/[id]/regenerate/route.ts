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

const bodySchema = z.object({
  feedback: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const locale = await getUserLocale(user.id);
    const { id } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.flatten());
    }
    const feedback = parsed.data.feedback;

    const original = await getDerivationById(id, workspace.id);
    if (!original) {
      return apiError("derivationNotFound", 404);
    }

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
      feedback: feedback ?? undefined,
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
      await updateDerivationStatus(newDerivation.id, workspace.id, "failed");
      await refreshCampaignStatus(original.campaignId, workspace.id);

      const t = await getTranslations({ locale, namespace: "errors" });
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
