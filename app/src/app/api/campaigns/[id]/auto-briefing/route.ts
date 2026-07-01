import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { objectStorage } from "@/server/storage";
import { analyzeImageContent } from "@/server/ai/image-analysis";
import { spendOrApiError } from "@/server/billing/paywall";

const postBodySchema = z.object({
  imageKey: z.string().min(1),
});

function mapContentBriefToBriefingFields(content: {
  product: string;
  offer: string;
  cta: { text: string; style: string };
  brandElements: string[];
  keyVisual: string;
  textContent: { headline: string; bullets: string[] };
  format: string;
}): {
  client: string;
  product: string | null;
  offer: string;
  objective: string;
  audience: string;
  ctaText: string;
  constraints: string;
} {
  const constraints = content.brandElements?.length
    ? `Preserve: ${content.brandElements.join(", ")}`
    : "";

  return {
    client: content.product || "",
    product: content.product || null,
    offer: content.offer || "",
    objective: content.cta?.text
      ? `Drive action: ${content.cta.text}`
      : "",
    audience: content.keyVisual
      ? `Visual target: ${content.keyVisual}`
      : "",
    ctaText: content.cta?.text || "",
    constraints,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400, parsed.error.format());
    }

    const { imageKey } = parsed.data;

    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "creative_qa",
      amount: 1,
      idempotencyKey: `auto-briefing:${campaignId}:${imageKey}`,
      metadata: { campaignId, imageKey },
    });
    if (creditError) return creditError;

    const imageBuffer = await objectStorage.get(imageKey);

    const mimeType = imageKey.endsWith(".png")
      ? "image/png"
      : imageKey.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";

    const content = await analyzeImageContent(imageBuffer, mimeType);
    const fields = mapContentBriefToBriefingFields(content);

    return NextResponse.json({
      extracted: fields,
      confidence: {
        client: content.product ? 0.85 : 0.3,
        offer: content.offer ? 0.8 : 0.3,
        ctaText: content.cta?.text ? 0.9 : 0.2,
        audience: content.keyVisual ? 0.6 : 0.2,
      },
    });
  } catch (error) {
    return handleApiError(error, "campaigns.auto-briefing.POST");
  }
}
