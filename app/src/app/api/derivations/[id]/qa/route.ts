import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById, updateDerivationQa } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const [locale, derivation] = await Promise.all([
      getUserLocale(user.id),
      getDerivationById(id, workspace.id),
    ]);

    if (!derivation) return apiError("derivationNotFound", 404);
    if (derivation.status !== "approved") return apiError("derivationNotApprovedForQa", 409);
    if (!derivation.outputKey) return apiError("derivationMissingOutput", 400);
    if (derivation.qaStatus && derivation.qaStatus !== "pending") {
      return NextResponse.json({
        qa: {
          status: derivation.qaStatus,
          checklist: derivation.qaChecklist,
          issues: derivation.qaIssues ?? [],
          suggestions: derivation.qaSuggestions ?? [],
        },
        derivation,
        cached: true,
      });
    }

    const creditError = await spendCreditsOrApiError({
      workspaceId: workspace.id,
      action: "creative_qa",
      amount: 1,
      idempotencyKey: `qa:${id}`,
      metadata: { derivationId: id, campaignId: derivation.campaignId },
    });
    if (creditError) return creditError;

    const campaign = await getCampaignById(derivation.campaignId, workspace.id);
    if (!campaign) return apiError("campaignNotFound", 404);

    const imageBuffer = await downloadBuffer(derivation.outputKey);
    const qa = await analyzeCreativeQa({
      imageBuffer,
      mimeType: "image/png",
      locale,
      campaign: {
        name: campaign.name ?? "",
        client: campaign.client ?? "",
        product: campaign.product ?? "",
        offer: campaign.offer ?? "",
        objective: campaign.objective ?? "",
        audience: campaign.audience ?? "",
        tone: campaign.tone,
        creativeDiagnosis: campaign.creativeDiagnosis,
      },
      derivation: {
        ctaText: derivation.ctaText,
        format: derivation.format,
        generationMode: derivation.generationMode,
      },
    });

    const updated = await updateDerivationQa(id, workspace.id, {
      qaStatus: qa.status,
      qaChecklist: qa.checklist,
      qaIssues: qa.issues,
      qaSuggestions: qa.suggestions,
    });

    await recordBrandMemoryEvent({
      type: "creative_qa_completed",
      workspaceId: workspace.id,
      clientProfileId: campaign.clientProfileId,
      campaignId: campaign.id,
      derivationId: derivation.id,
      occurredAt: updated?.qaAnalyzedAt ?? new Date(),
      summary: `Creative QA completed with status "${qa.status}" for campaign "${campaign.name}".`,
      payload: {
        campaign: {
          name: campaign.name,
          client: campaign.client,
          product: campaign.product,
          offer: campaign.offer,
          audience: campaign.audience,
          tone: campaign.tone,
          constraints: campaign.constraints,
        },
        derivation: {
          format: derivation.format,
          generationMode: derivation.generationMode,
          ctaText: derivation.ctaText,
        },
        qa: {
          status: qa.status,
          checklist: qa.checklist,
          issues: qa.issues,
          suggestions: qa.suggestions,
        },
      },
    });

    return NextResponse.json({ qa, derivation: updated });
  } catch (error) {
    return handleApiError(error, "derivations.[id].qa.POST");
  }
}
