import { z } from "zod";
import { apiError, apiSuccess, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getAssetWithMetadata, updateAssetMetadata } from "@/server/repositories/asset";
import { analyzeCampaignCreative } from "@/server/ai/campaign-deduction";
import { getPublicUrl } from "@/server/storage/r2";

const analyzeSchema = z.object({
  assetId: z.string().uuid(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id: campaignId } = await params;

    const body = await request.json();
    const parsed = analyzeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { assetId } = parsed.data;

    // Get the asset and verify it belongs to this campaign/workspace
    const asset = await getAssetWithMetadata(assetId, workspace.id);
    if (!asset || asset.campaignId !== campaignId) {
      return apiError("assetNotFound", 404);
    }

    // Update status to pending
    await updateAssetMetadata(assetId, workspace.id, {}, "pending");

    try {
      // Construct public URL from the asset key
      const imageUrl = getPublicUrl(asset.key);

      // Call AI analysis with the asset URL
      const result = await analyzeCampaignCreative(imageUrl);

      // Store result in metadata
      await updateAssetMetadata(assetId, workspace.id, {
        analysisResult: result,
      }, "completed");

      return apiSuccess({
        analysis: result,
        status: "completed",
      });
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
      
      // Graceful degradation: mark as failed but don't error
      await updateAssetMetadata(assetId, workspace.id, {
        analysisResult: {},
      }, "failed");

      return apiSuccess({
        analysis: {},
        status: "failed",
        message: "Analysis could not be completed. You can fill in the details manually.",
      });
    }
  } catch (error) {
    return handleApiError(error, "campaigns.[id].analyze.POST");
  }
}
