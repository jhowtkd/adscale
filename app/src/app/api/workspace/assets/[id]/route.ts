import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getWorkspaceAssetById,
  updateWorkspaceAsset,
  deleteWorkspaceAsset,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { isWorkspaceAssetKey } from "@/server/repositories/asset";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const asset = await getWorkspaceAssetById(id, workspace.id);
    if (!asset) {
      return apiError("assetNotFound", 404);
    }

    return NextResponse.json({ asset });
  } catch (error) {
    return handleApiError(error, "workspace.assets.[id].GET");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const asset = await getWorkspaceAssetById(id, workspace.id);
    if (!asset) {
      return apiError("assetNotFound", 404);
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const updated = await updateWorkspaceAsset(id, workspace.id, {
      name: parsed.data.name,
      tags: parsed.data.tags,
      metadata: parsed.data.metadata,
    });

    return NextResponse.json({ asset: updated });
  } catch (error) {
    return handleApiError(error, "workspace.assets.[id].PATCH");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const asset = await getWorkspaceAssetById(id, workspace.id);
    if (!asset) {
      return apiError("assetNotFound", 404);
    }

    // Check if asset is still referenced by campaign assets
    const inUse = await isWorkspaceAssetKey(workspace.id, asset.key);
    if (inUse) {
      return apiError("assetInUse", 409, {
        detail: "Asset is linked to one or more campaigns",
      });
    }

    // Delete from R2 first
    try {
      await objectStorage.delete(asset.key);
    } catch (err) {
      logger.warn("[workspace-asset] R2 delete failed — possible orphan", {
        assetId: id,
        key: asset.key,
        error: err,
      });
    }

    await deleteWorkspaceAsset(id, workspace.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, "workspace.assets.[id].DELETE");
  }
}
