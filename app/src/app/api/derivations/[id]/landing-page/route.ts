import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createLandingPage,
  completeLandingPage,
  failLandingPage,
  getLandingPagesByDerivation,
} from "@/server/repositories/landing-page";
import { generateLandingPageStructure } from "@/server/ai/landing-page";
import { renderLandingPageHtml } from "@/server/services/landing-page-renderer";
import { objectStorage } from "@/server/storage";
import { spendOrApiError } from "@/server/billing/paywall";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const derivation = await getDerivationById(id, workspace.id);
    if (!derivation) {
      return apiError("derivationNotFound", 404);
    }
    if (derivation.status !== "approved") {
      return apiError("derivationNotApproved", 409);
    }
    if (!derivation.outputKey) {
      return apiError("derivationMissingOutput", 400);
    }

    const campaign = await getCampaignById(derivation.campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const existingPages = await getLandingPagesByDerivation(workspace.id, derivation.id);
    const completedPage = existingPages.find((page) => page.status === "completed" && page.htmlKey);
    if (completedPage?.htmlKey) {
      const downloadUrl = await objectStorage.signedDownloadUrl(completedPage.htmlKey);
      return NextResponse.json({
        landingPage: completedPage,
        downloadUrl,
        expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
      });
    }
    if (existingPages.some((page) => page.status === "queued")) {
      return apiError("landingPageGenerationInProgress", 429);
    }

    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "landing_page",
      idempotencyKey: `landing-page:${derivation.id}`,
      metadata: { sourceDerivationId: derivation.id, campaignId: derivation.campaignId },
    });
    if (creditError) return creditError;

    const landingPage = await createLandingPage({
      workspaceId: workspace.id,
      campaignId: derivation.campaignId,
      sourceDerivationId: derivation.id,
    });

    try {
      const structure = await generateLandingPageStructure(
        {
          name: campaign.name,
          client: campaign.client,
          product: campaign.product,
          objective: campaign.objective,
          audience: campaign.audience,
          offer: campaign.offer,
          tone: campaign.tone,
          constraints: campaign.constraints,
          notes: campaign.notes,
          ctaVariants: campaign.ctaVariants,
        },
        {
          prompt: derivation.prompt,
          ctaText: derivation.ctaText,
          format: derivation.format,
        }
      );

      const imageUrl = objectStorage.publicUrl(derivation.outputKey);
      const html = renderLandingPageHtml({ structure, imageUrl });

      const htmlKey = `landing-pages/${workspace.id}/${derivation.id}/${Date.now()}.html`;
      await objectStorage.put(htmlKey, Buffer.from(html, "utf-8"), "text/html");

      const [completed, downloadUrl] = await Promise.all([
        completeLandingPage({
          id: landingPage.id,
          workspaceId: workspace.id,
          title: structure.title,
          structure,
          htmlKey,
        }),
        objectStorage.signedDownloadUrl(htmlKey),
      ]);
      const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

      return NextResponse.json({
        landingPage: {
          id: completed?.id ?? landingPage.id,
          status: "completed" as const,
          title: completed?.title ?? structure.title,
          htmlKey: completed?.htmlKey ?? htmlKey,
        },
        downloadUrl,
        expiresAt,
      });
    } catch (innerError) {
      logger.error("[landing-page POST] generation failed", innerError);
      await failLandingPage({
        id: landingPage.id,
        workspaceId: workspace.id,
        error:
          innerError instanceof Error
            ? innerError.message
            : "Landing page generation failed",
      });
      return handleApiError(innerError, "derivations.[id].landing-page.POST");
    }
  } catch (error) {
    return handleApiError(error, "derivations.[id].landing-page.POST");
  }
}
