import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { createAsset } from "@/server/repositories/asset";

const linkSchema = z.object({
  workspaceAssetId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const body = await request.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const workspaceAsset = await getWorkspaceAssetById(
      parsed.data.workspaceAssetId,
      workspace.id
    );
    if (!workspaceAsset) {
      return apiError("assetNotFound", 404);
    }

    // Create a campaign asset that references the same R2 key
    const asset = await createAsset(workspace.id, campaignId, {
      key: workspaceAsset.key,
      type: workspaceAsset.type,
      size: workspaceAsset.size ?? undefined,
      width: workspaceAsset.width ?? undefined,
      height: workspaceAsset.height ?? undefined,
      role: "linked",
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.link.POST");
  }
}
