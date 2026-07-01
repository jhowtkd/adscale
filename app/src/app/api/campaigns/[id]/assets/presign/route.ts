import { NextResponse } from "next/server";
import { isAllowedImageType, sanitizeStorageFilename } from "@/lib/upload-config";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { createPendingUpload, failExpiredPendingUploads } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive(),
});

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const PRESIGN_TTL_SECONDS = 300;

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
    const parsed = presignSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { filename, contentType, contentLength } = parsed.data;

    if (!isAllowedImageType(contentType)) {
      return apiError("invalidFileType", 400);
    }

    if (contentLength > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    await failExpiredPendingUploads();

    const safeName = sanitizeStorageFilename(filename);
    const key = `campaigns/${campaignId}/${crypto.randomUUID()}-${safeName}`;
    const url = await objectStorage.signedUploadUrl(key, contentType, contentLength);
    const expiresAt = new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000);

    await createPendingUpload({
      workspaceId: workspace.id,
      campaignId,
      key,
      filename,
      contentType,
      contentLength,
      expiresAt,
    });

    return NextResponse.json({ url, key, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.presign.POST");
  }
}
