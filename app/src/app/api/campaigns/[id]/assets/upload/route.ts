import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { createAsset } from "@/server/repositories/asset";
import { uploadBuffer } from "@/server/storage/r2";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return apiError("invalidInput", 400);
    }

    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      return apiError("invalidFileType", 400);
    }

    if (file.size <= 0 || file.size > MAX_SIZE) {
      return apiError("fileTooLarge", 400);
    }

    const parsed = uploadSchema.safeParse({
      width: formData.get("width"),
      height: formData.get("height"),
    });

    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/\.{2,}/g, ".");
    const key = `campaigns/${campaignId}/${crypto.randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadBuffer(key, buffer, file.type);

    const asset = await createAsset(workspace.id, campaignId, {
      key,
      type: file.type,
      size: file.size,
      width: parsed.data.width,
      height: parsed.data.height,
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].assets.upload.POST");
  }
}
