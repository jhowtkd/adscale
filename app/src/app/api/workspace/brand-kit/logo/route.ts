import { NextResponse } from "next/server";
import { ALLOWED_IMAGE_TYPES, isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { uploadBuffer, getPublicUrl } from "@/server/storage/r2";
import { createClientReference } from "@/server/repositories/client-reference";
import {
  getBrandKitByWorkspace,
  upsertBrandKit,
} from "@/server/db/repositories/brand-kit";

const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

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

    const safeName = file.name
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .replace(/\.{2,}/g, ".");
    const key = `workspaces/${workspace.id}/brand-kit/${crypto.randomUUID()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadBuffer(key, buffer, file.type);

    // Ensure brand kit profile exists
    let brandKit = await getBrandKitByWorkspace(workspace.id);
    if (!brandKit) {
      brandKit = await upsertBrandKit(workspace.id, { name: "Brand Kit" });
    }

    // Create client reference with kind = "logo"
    const reference = await createClientReference(workspace.id, {
      clientProfileId: brandKit.id,
      assetKey: key,
      label: file.name,
      kind: "logo",
    });

    // Update logoAssetKey on the profile
    await upsertBrandKit(workspace.id, { logoAssetKey: key });

    return NextResponse.json(
      {
        reference: {
          ...reference,
          url: getPublicUrl(key),
        },
        logoAssetKey: key,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.logo.POST");
  }
}
