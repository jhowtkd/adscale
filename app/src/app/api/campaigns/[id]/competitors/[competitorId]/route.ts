import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  getCompetitorAnalysisById,
  updateCompetitorAnalysis,
  deleteCompetitorAnalysis,
} from "@/server/repositories/competitor-analysis";
import { getPublicUrl } from "@/server/storage/r2";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  platform: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  screenshotKeys: z.array(z.string()).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
  analysis: z.record(z.unknown()).optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; competitorId: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId, competitorId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const existing = await getCompetitorAnalysisById(competitorId, workspace.id);
    if (!existing || existing.campaignId !== campaignId) {
      return apiError("notFound", 404);
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const data = parsed.data;

    const updated = await updateCompetitorAnalysis(competitorId, workspace.id, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.screenshotKeys !== undefined && { screenshots: data.screenshotKeys }),
      ...(data.strengths !== undefined && { strengths: data.strengths }),
      ...(data.weaknesses !== undefined && { weaknesses: data.weaknesses }),
      ...(data.differentiators !== undefined && { differentiators: data.differentiators }),
      ...(data.analysis !== undefined && { analysis: data.analysis }),
    });

    if (!updated) {
      return apiError("notFound", 404);
    }

    const withUrls = {
      ...updated,
      screenshotUrls: (updated.screenshots ?? []).map((key) => getPublicUrl(key)),
    };

    return NextResponse.json({ competitor: withUrls });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].competitors.[competitorId].PATCH");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; competitorId: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId, competitorId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const existing = await getCompetitorAnalysisById(competitorId, workspace.id);
    if (!existing || existing.campaignId !== campaignId) {
      return apiError("notFound", 404);
    }

    await deleteCompetitorAnalysis(competitorId, workspace.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].competitors.[competitorId].DELETE");
  }
}
