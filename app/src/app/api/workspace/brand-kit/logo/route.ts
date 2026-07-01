import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { objectStorage } from "@/server/storage";
import { createClientReference } from "@/server/repositories/client-reference";
import {
  BrandKitAmbiguityError,
  BrandKitProfileNotFoundError,
  getBrandKit,
  getBrandKitByWorkspace,
  upsertBrandKit,
} from "@/server/db/repositories/brand-kit";

const MAX_SIZE = 10 * 1024 * 1024;

function readClientProfileId(request: Request) {
  return new URL(request.url).searchParams.get("clientProfileId");
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const clientProfileId = readClientProfileId(request);

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

    await objectStorage.put(key, buffer, file.type);

    let brandKit = clientProfileId
      ? await getBrandKit(workspace.id, clientProfileId)
      : await getBrandKitByWorkspace(workspace.id);

    if (!brandKit) {
      if (!clientProfileId) {
        const profiles = await import("@/server/repositories/client-reference").then((mod) =>
          mod.getClientProfiles(workspace.id)
        );
        if (profiles.length > 1) {
          return apiError("brandKitAmbiguous", 409, {
            detail: "Multiple client profiles exist; clientProfileId is required",
          });
        }
      }
      brandKit = await upsertBrandKit(workspace.id, { name: "Brand Kit" }, clientProfileId);
    }

    const reference = await createClientReference(workspace.id, {
      clientProfileId: brandKit.id,
      assetKey: key,
      label: file.name,
      kind: "logo",
    });

    await upsertBrandKit(workspace.id, { logoAssetKey: key }, brandKit.id);

    return NextResponse.json(
      {
        reference: {
          ...reference,
          url: objectStorage.publicUrl(key),
        },
        logoAssetKey: key,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof BrandKitAmbiguityError) {
      return apiError("brandKitAmbiguous", 409, { detail: error.message });
    }
    if (error instanceof BrandKitProfileNotFoundError) {
      return apiError("clientProfileNotFound", 404, { detail: error.message });
    }
    return handleApiError(error, "workspace.brand-kit.logo.POST");
  }
}
