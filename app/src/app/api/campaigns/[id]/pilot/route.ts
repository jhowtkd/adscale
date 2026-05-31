import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getCampaignById,
  updateCampaign,
} from "@/server/repositories/campaign";

const pilotSchema = z.object({
  assetId: z.string().min(1),
  briefing: z.object({
    objective: z.string().optional(),
    audience: z.string().optional(),
    tone: z.string().optional(),
    platforms: z.union([z.string(), z.array(z.string())]).optional(),
    ctaText: z.string().optional(),
    constraints: z.string().optional(),
    notes: z.string().optional(),
  }),
});

function normalizePlatforms(
  platforms: string | string[] | undefined
): string[] | undefined {
  if (platforms === undefined) return undefined;
  if (Array.isArray(platforms)) return platforms;
  return platforms.split(",").flatMap((p) => {
    const trimmed = p.trim();
    return trimmed ? [trimmed] : [];
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const body = await request.json();
    const parsed = pilotSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { briefing } = parsed.data;

    const campaign = await getCampaignById(id, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const updatedCampaign = await updateCampaign(id, workspace.id, {
      objective: briefing.objective,
      audience: briefing.audience,
      tone: briefing.tone,
      platforms: normalizePlatforms(briefing.platforms),
      ctaVariants: briefing.ctaText ? [briefing.ctaText] : undefined,
      constraints: briefing.constraints,
      notes: briefing.notes,
      status: "draft",
    });

    if (!updatedCampaign) {
      return apiError("campaignNotFound", 404);
    }

    return NextResponse.json({ campaign: updatedCampaign });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].pilot.POST");
  }
}
