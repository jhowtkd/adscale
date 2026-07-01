import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import {
  createPlan,
  getPlanByCampaign,
  updatePlanStatus,
} from "@/server/repositories/plan";
import { buildPlanPrompt } from "@/server/ai/prompt-builder";
import { env } from "@/server/validation/env";
import { getOpenAI } from "@/server/ai/utils";
import { spendOrApiError } from "@/server/billing/paywall";
import {
  shouldSendToUser,
  getUserLocale,
  sendPlanReadyEmail,
} from "@/server/services/notifications";

const planSchema = z.object({
  strategy: z.string(),
  angles: z.array(z.string()),
  hooks: z.array(z.string()),
  ctas: z.array(z.string()),
});

const updatePlanSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const plan = await getPlanByCampaign(campaignId, workspace.id);
    if (!plan) {
      return NextResponse.json({ plan: null });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].plan.GET");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const rateLimitResult = await checkRateLimit(request, { category: "ai", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const existingPlan = await getPlanByCampaign(campaignId, workspace.id);
    if (existingPlan) {
      return NextResponse.json({ plan: existingPlan, cached: true });
    }

    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "creative_plan",
      idempotencyKey: `creative-plan:${campaignId}`,
      metadata: { campaignId },
    });
    if (creditError) return creditError;

    const assets = await getAssetsByCampaign(campaignId, workspace.id);
    const asset = assets[0];

    const prompt = buildPlanPrompt(campaign, asset, (user as { locale?: string }).locale);

    const completion = await getOpenAI().chat.completions.create({
      model: env.OPENAI_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2048,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      return apiError("aiEmptyResponse", 502);
    }

    // Extract JSON from potential markdown code block
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch {
      logger.error("Invalid JSON from AI:", rawContent);
      return apiError("aiInvalidJson", 502);
    }

    const validated = planSchema.safeParse(parsedJson);
    if (!validated.success) {
      return apiError("aiValidationFailed", 502, validated.error.flatten());
    }

    const plan = await createPlan(campaignId, workspace.id, validated.data);

    try {
      const { send, email } = await shouldSendToUser(user.id);
      if (send && email) {
        const locale = await getUserLocale(user.id);
        await sendPlanReadyEmail({
          to: email,
          campaignName: campaign.name,
          locale,
        });
      }
    } catch (emailErr) {
      logger.warn("[plan POST] failed to send plan ready email", emailErr);
    }

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].plan.POST");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json();
    const parsed = updatePlanSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const plan = await getPlanByCampaign(campaignId, workspace.id);
    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    const updated = await updatePlanStatus(plan.id, workspace.id, parsed.data.status);

    return NextResponse.json({ plan: updated });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].plan.PATCH");
  }
}
