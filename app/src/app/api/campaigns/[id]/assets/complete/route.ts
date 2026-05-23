import { NextResponse } from "next/server";
import { ALLOWED_IMAGE_TYPES } from "@/lib/upload-config";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import {
  createAsset,
  getPendingUpload,
  markPendingUploadCompleted,
} from "@/server/repositories/asset";
import { headObject, deleteObject } from "@/server/storage/r2";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

const completeSchema = z.object({
  key: z.string().min(1),
  type: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.number().int().min(1).max(MAX_SIZE),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
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
    const parsed = completeSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const { key, type, size, width, height } = parsed.data;

    // Validate key starts with the campaign's asset prefix
    const expectedPrefix = `campaigns/${campaignId}/`;
    if (!key.startsWith(expectedPrefix)) {
      return apiError("invalidAssetKey", 400);
    }

    const pendingUpload = await getPendingUpload(workspace.id, campaignId, key);
    if (!pendingUpload) {
      return apiError("uploadNotPresigned", 400);
    }

    if (pendingUpload.expiresAt < new Date()) {
      return apiError("uploadExpired", 400);
    }

    if (
      pendingUpload.contentType !== type ||
      Math.abs(pendingUpload.contentLength - size) > 1024
    ) {
      return apiError("uploadMetadataMismatch", 400);
    }

    // Verify the object actually exists in R2
    const head = await headObject(key);
    if (!head) {
      return apiError("assetNotFound", 400);
    }

    // Verify Content-Type matches (ignore charset suffix)
    if (head.ContentType && head.ContentType.split(";")[0].trim() !== type) {
      await deleteObject(key);
      return apiError("assetTypeMismatch", 400);
    }

    // Verify size matches (with small tolerance)
    if (
      typeof head.ContentLength === "number" &&
      Math.abs(head.ContentLength - size) > 1024
    ) {
      await deleteObject(key);
      return apiError("assetSizeMismatch", 400);
    }

    const asset = await createAsset(workspace.id, campaignId, {
      key,
      type,
      size,
      width,
      height,
    });
    await markPendingUploadCompleted(pendingUpload.id, workspace.id);

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.complete.POST");
  }
}
