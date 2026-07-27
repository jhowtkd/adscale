import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { restyleCampaign } from "@/server/application/restyle-campaign";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  failStaleActiveDerivations,
  getDerivationsByCampaign,
} from "@/server/repositories/derivation";
import { refreshCampaignStatus } from "@/server/repositories/campaign";
import { getUserLocale } from "@/server/repositories/user";
import { objectStorage } from "@/server/storage";
import { serializeDerivationForApi } from "@/server/ai/derivation-auto-retry-observability";

const restyleSchema = z.object({
  styleAssetIds: z.array(z.string().uuid()).optional(),
  styleIntensity: z.enum(["soft", "medium", "strong"]).optional(),
  creativeLevel: z
    .enum(["conservative", "balanced", "bold", "extreme"])
    .optional(),
});

const STALE_ACTIVE_DERIVATION_MINUTES = 10;

/**
 * HTTP adapter for restyle — auth, rate limit, parse only.
 * Domain rules live in `restyleCampaign`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const [locale, body] = await Promise.all([
      getUserLocale(user.id),
      request.json(),
    ]);
    const parsed = restyleSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { styleAssetIds, styleIntensity, creativeLevel } = parsed.data;

    const result = await restyleCampaign({
      workspaceId: workspace.id,
      campaignId,
      userId: user.id,
      locale,
      styleAssetIds,
      styleIntensity,
      creativeLevel,
      billingAction: "image_derivation",
      billingAmount: 5,
      // Each panel click is a new settlement; network retries may send Idempotency-Key.
      billingAttemptId:
        request.headers.get("idempotency-key")?.trim() ||
        request.headers.get("x-idempotency-key")?.trim() ||
        crypto.randomUUID(),
      billingMetadata: { campaignId, mode: "restyling" },
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "campaign_not_found":
          return apiError("campaignNotFound", 404);
        case "derivations_in_progress":
          return apiError("derivationsInProgress", 429);
        case "missing_base_asset":
        case "invalid_base_asset":
          return apiError("missingBaseAsset", 400);
        case "style_asset_not_found":
          return apiError("assetNotFound", 404);
        case "missing_style_asset":
          return apiError("invalidInput", 400, {
            styleAssetIds: [
              "Restyling requires a style reference asset different from the factual base asset",
            ],
          });
        case "credit_blocked":
          return apiError(
            result.error.spend.conversionPayload.reason,
            402,
            result.error.spend.conversionPayload
          );
        case "dispatch_failed":
          return apiError("failedQueueDerivations", 500);
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json(
      { derivations: [result.value.derivation] },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "campaigns.[id].restyle.POST");
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const stale = await failStaleActiveDerivations(
      campaignId,
      workspace.id,
      STALE_ACTIVE_DERIVATION_MINUTES
    );
    if (stale.length > 0) {
      await refreshCampaignStatus(campaignId, workspace.id);
    }

    const items = await getDerivationsByCampaign(campaignId, workspace.id);
    const derivationsWithImageUrl = await Promise.all(
      items.map(async (d) =>
        serializeDerivationForApi({
          ...d,
          imageUrl: d.outputKey
            ? await objectStorage.signedDownloadUrl(d.outputKey)
            : null,
        })
      )
    );
    return NextResponse.json({ derivations: derivationsWithImageUrl });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].restyle.GET");
  }
}
