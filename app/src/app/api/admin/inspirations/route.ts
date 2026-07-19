import { NextResponse } from "next/server";
import {
  MAX_FILE_SIZE_BYTES,
  isAllowedImageType,
  sanitizeStorageFilename,
  validateImageMagicBytes,
} from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createWorkspaceAsset,
  getCuratedInspirations,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

function present(asset: Awaited<ReturnType<typeof getCuratedInspirations>>[number]) {
  return {
    id: asset.id,
    title: asset.name.replace(/\.[^.]+$/, ""),
    filename: asset.name,
    previewUrl: `/api/creative-work/inspirations/${asset.id}/file`,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    return NextResponse.json({
      inspirations: (await getCuratedInspirations()).map(present),
    });
  } catch (error) {
    return handleApiError(error, "admin.inspirations.GET");
  }
}

export async function POST(request: Request) {
  try {
    const [{ user }, { workspace }] = await Promise.all([
      requirePlatformOwner(request),
      requireWorkspaceAccess(request),
    ]);
    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength > MAX_FILE_SIZE_BYTES + 1024 * 1024) {
      return apiError("fileTooLarge", 400);
    }

    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !isAllowedImageType(file.type)) {
      return apiError("invalidFileType", 400);
    }
    if (
      file.size <= 0
      || file.size > MAX_FILE_SIZE_BYTES
      || !(await validateImageMagicBytes(file, file.type))
    ) {
      return apiError(file.size > MAX_FILE_SIZE_BYTES ? "fileTooLarge" : "invalidFileType", 400);
    }

    const key = `curated-inspirations/${crypto.randomUUID()}-${sanitizeStorageFilename(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await objectStorage.put(key, buffer, file.type);
    try {
      const asset = await createWorkspaceAsset({
        workspaceId: workspace.id,
        name: file.name,
        key,
        type: file.type,
        size: file.size,
        source: "curated_inspiration",
        metadata: { uploadedByUserId: user.id },
      });
      if (!asset) throw new Error("Failed to persist curated inspiration");
      return NextResponse.json({ inspiration: present(asset) }, { status: 201 });
    } catch (error) {
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }
  } catch (error) {
    return handleApiError(error, "admin.inspirations.POST");
  }
}
