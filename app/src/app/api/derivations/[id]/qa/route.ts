import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { recordBetaAnalyticsEvent } from "@/server/beta-analytics/record";
import { getBetaSessionIdFromRequest } from "@/server/beta-analytics/session";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getDerivationById,
  updateDerivationQa,
  updateDerivationQualityGate,
} from "@/server/repositories/derivation";
import { computeQualityGateFromAnalysis } from "@/server/ai/creative-quality-gate";
import { getCampaignById } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { downloadBuffer } from "@/server/storage/r2";
import { analyzeCreativeQa } from "@/server/ai/creative-qa";
import { spendCreditsOrApiError } from "@/server/billing/gates";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { resolveCtaSemantics } from "@/server/ai/creative-contract";
import type { CreativeContract } from "@/server/ai/creative-contract";

function emitReviewMissionCompleted(input: {
  workspaceId: string;
  userId: string;
  campaignId: string;
  derivationId: string;
  sessionId?: string;
  operation: "qa" | "qa_cached";
}) {
  void recordBetaAnalyticsEvent({
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventKey: "mission_completed",
    source: "server",
    campaignId: input.campaignId,
    derivationId: input.derivationId,
    sessionId: input.sessionId,
    properties: {
      missionKey: "review",
      stage: "review",
      operation: input.operation,
    },
  }).catch((err) => {
    logger.warn("[derivations.qa.POST] mission_completed analytics failed", err);
  });
}

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
    const sessionId = getBetaSessionIdFromRequest(request);

    if (!derivation) return apiError("derivationNotFound", 404);
    if (derivation.status !== "approved") return apiError("derivationNotApprovedForQa", 409);
    if (!derivation.outputKey) return apiError("derivationMissingOutput", 400);
    if (derivation.qaStatus && derivation.qaStatus !== "pending") {
      emitReviewMissionCompleted({
        workspaceId: workspace.id,
        userId: user.id,
        campaignId: derivation.campaignId,
        derivationId: id,
        sessionId,
        operation: "qa_cached",
      });

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

    const derivationGenerationMode = (derivation.generationMode ?? "art_variation") as CreativeContract["generationMode"];
    const qaContract: CreativeContract = {
      generationMode: derivationGenerationMode,
      targetFormat: derivation.format ?? "1:1",
      ctaSemantics: resolveCtaSemantics(derivation.ctaText, derivationGenerationMode),
      baseAssetId: null,
      styleAssetId: (derivation as { styleAssetId?: string | null }).styleAssetId ?? null,
      client: campaign.client ?? null,
      product: campaign.product ?? null,
      offer: campaign.offer ?? null,
      constraints: null,
    };

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
      contract: qaContract,
    });

    const scoreIssues = Array.isArray(derivation.scoreIssues)
      ? (derivation.scoreIssues as string[])
      : [];
    const gate = computeQualityGateFromAnalysis({
      checklist: qa.checklist,
      contract: qaContract,
      scoreIssues,
      qualityScore: derivation.qualityScore,
    });

    const updated = await updateDerivationQa(id, workspace.id, {
      qaStatus: qa.status,
      qaChecklist: qa.checklist,
      qaIssues: qa.issues,
      qaSuggestions: qa.suggestions,
    });

    const gatedAt = new Date();
    const withGate = await updateDerivationQualityGate(id, workspace.id, {
      qualityVerdict: gate.qualityVerdict,
      hardFailures: gate.hardFailures,
      polishSuggestions: gate.polishSuggestions,
      qualityGatedAt: gatedAt,
    });

    emitReviewMissionCompleted({
      workspaceId: workspace.id,
      userId: user.id,
      campaignId: derivation.campaignId,
      derivationId: id,
      sessionId,
      operation: "qa",
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

    return NextResponse.json({
      qa,
      derivation: withGate ?? updated,
      qualityVerdict: gate.qualityVerdict,
      hardFailures: gate.hardFailures,
      polishSuggestions: gate.polishSuggestions,
    });
  } catch (error) {
    return handleApiError(error, "derivations.[id].qa.POST");
  }
}
