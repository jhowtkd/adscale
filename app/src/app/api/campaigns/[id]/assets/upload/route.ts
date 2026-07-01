import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes, sanitizeStorageFilename } from "@/lib/upload-config";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { objectStorage } from "@/server/storage";

const MAX_SIZE = 50 * 1024 * 1024;

const uploadSchema = z.object({
  width: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  height: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().positive().optional()
  ),
  role: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.string().optional()
  ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    if (!z.string().uuid().safeParse(campaignId).success) {
      return apiError("campaignNotFound", 404);
    }

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > MAX_SIZE) {
        return apiError("fileTooLarge", 400);
      }
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("invalidInput", 400);
    }

    if (!isAllowedImageType(file.type)) {
      return apiError("invalidFileType", 400);
    }

    if (!(await validateImageMagicBytes(file, file.type))) {
      return apiError("invalidFileType", 400);
    }

    if (file.size <= 0 || file.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    const parsed = uploadSchema.safeParse({
      width: formData.get("width"),
      height: formData.get("height"),
      role: formData.get("role"),
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const safeName = sanitizeStorageFilename(file.name);
    const key = `campaigns/${campaignId}/${crypto.randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await objectStorage.put(key, buffer, file.type);

    const asset = await createAsset(workspace.id, campaignId, {
      key,
      type: file.type,
      size: file.size,
      width: parsed.data.width,
      height: parsed.data.height,
      role: parsed.data.role,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.upload.POST");
  }
}
