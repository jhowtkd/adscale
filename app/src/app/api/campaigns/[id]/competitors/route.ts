import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  getCompetitorAnalysesByCampaign,
  createCompetitorAnalysis,
} from "@/server/repositories/competitor-analysis";
import { isWorkspaceAssetKey } from "@/server/repositories/asset";
import { getPublicUrl } from "@/server/storage/r2";

const createSchema = z.object({
  name: z.string().min(1),
  platform: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  screenshotKeys: z.array(z.string()).max(10).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
  analysis: z.record(z.unknown()).optional().nullable(),
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

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const analyses = await getCompetitorAnalysesByCampaign(campaignId, workspace.id);

    const withUrls = analyses.map((a) => ({
      ...a,
      screenshotUrls: (a.screenshots ?? []).map((key) => getPublicUrl(key)),
    }));

    return NextResponse.json({ competitors: withUrls });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].competitors.GET");
  }
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

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const data = parsed.data;

    // Validate screenshot keys belong to the workspace
    if (data.screenshotKeys && data.screenshotKeys.length > 0) {
      const validations = await Promise.all(
        data.screenshotKeys.map((key) => isWorkspaceAssetKey(workspace.id, key))
      );
      const invalidIndex = validations.findIndex((v) => !v);
      if (invalidIndex !== -1) {
        return apiError("invalidInput", 400, {
          detail: `Screenshot key ${invalidIndex + 1} does not belong to this workspace`,
        });
      }
    }

    const analysis = await createCompetitorAnalysis(workspace.id, {
      campaignId,
      name: data.name,
      platform: data.platform,
      website: data.website,
      screenshots: data.screenshotKeys,
      strengths: data.strengths,
      weaknesses: data.weaknesses,
      differentiators: data.differentiators,
      analysis: data.analysis,
    });

    const withUrls = {
      ...analysis,
      screenshotUrls: (analysis.screenshots ?? []).map((key) => getPublicUrl(key)),
    };

    return NextResponse.json({ competitor: withUrls }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].competitors.POST");
  }
}
