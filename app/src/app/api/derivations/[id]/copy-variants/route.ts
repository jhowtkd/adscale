import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getDerivationById } from "@/server/repositories/derivation";
import { getCampaignById } from "@/server/repositories/campaign";
import { getBrandKit } from "@/server/db/repositories/brand-kit";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import {
  createCopyVariant,
  getCopyVariantsByDerivation,
  deleteCopyVariantsByDerivation,
} from "@/server/repositories/copy-variant";
import { generateCopyVariants } from "@/server/ai/copy-generator";
import { spendOrApiError } from "@/server/billing/paywall";

const generateSchema = z.object({
  count: z.number().int().min(3).max(10).optional(),
  tones: z.array(z.string()).max(10).optional(),
  platform: z.string().max(50).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: derivationId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(new URL(request.url).pathname, request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const derivation = await getDerivationById(derivationId, workspace.id);
    if (!derivation) {
      return apiError("derivationNotFound", 404);
    }

    const campaign = await getCampaignById(derivation.campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    // Spend credits
    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "copy_generation",
      amount: 2,
      idempotencyKey: `copy-gen:${derivationId}:${JSON.stringify(parsed.data)}`,
      metadata: { derivationId, campaignId: campaign.id },
      userId: user.id,
    });
    if (creditError) return creditError;

    // Get brand kit
    const clientProfileId = await resolveCampaignClientProfileId(workspace.id, {
      clientProfileId: campaign.clientProfileId,
      client: campaign.client,
    });
    const brandKit = clientProfileId
      ? await getBrandKit(workspace.id, clientProfileId)
      : null;

    // Generate copy variants
    const variants = await generateCopyVariants(
      {
        briefing: {
          client: campaign.client,
          product: campaign.product,
          offer: campaign.offer,
          objective: campaign.objective,
          audience: campaign.audience,
          tone: campaign.tone,
        },
        brandKit: brandKit
          ? {
              toneOfVoice: brandKit.toneOfVoice,
              constraints: brandKit.constraints,
              prohibitedElements: brandKit.prohibitedElements,
            }
          : null,
        currentCta: derivation.ctaText,
        platform: parsed.data.platform,
      },
      {
        count: parsed.data.count,
        tones: parsed.data.tones,
      }
    );

    // Clear existing variants for this derivation
    await deleteCopyVariantsByDerivation(derivationId, workspace.id);

    // Save new variants
    const saved = await Promise.all(
      variants.map((v) =>
        createCopyVariant({
          derivationId,
          workspaceId: workspace.id,
          headline: v.headline,
          ctaText: v.ctaText,
          toneLabel: v.toneLabel,
          confidenceScore: v.confidenceScore,
          metadata: { reasoning: v.reasoning },
        })
      )
    );

    return NextResponse.json({ variants: saved }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "derivations.[id].copy-variants.POST");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: derivationId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const variants = await getCopyVariantsByDerivation(derivationId, workspace.id);
    return NextResponse.json({ variants });
  } catch (error) {
    return handleApiError(error, "derivations.[id].copy-variants.GET");
  }
}
