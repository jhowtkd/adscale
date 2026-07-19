import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { sanitizeStorageFilename } from "@/lib/upload-config";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  createWorkspaceAsset,
  getCuratedInspirationById,
  getMaterializedCuratedInspiration,
} from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const inspiration = await getCuratedInspirationById(id);
    if (!inspiration) return apiError("assetNotFound", 404);

    // ponytail: optimistic reuse is enough while a click is serialized in the UI;
    // add a unique workspace/origin index if concurrent materialization becomes observable.
    const existing = await getMaterializedCuratedInspiration(workspace.id, id);
    if (existing) return NextResponse.json({ assetId: existing.id });

    const key = `workspaces/${workspace.id}/assets/${crypto.randomUUID()}-${sanitizeStorageFilename(inspiration.name)}`;
    const buffer = await objectStorage.get(inspiration.key);
    await objectStorage.put(key, buffer, inspiration.type);
    try {
      const asset = await createWorkspaceAsset({
        workspaceId: workspace.id,
        name: inspiration.name,
        key,
        type: inspiration.type,
        size: buffer.length,
        source: "curated_inspiration_copy",
        metadata: { curatedInspirationId: id },
      });
      if (!asset) throw new Error("Failed to materialize curated inspiration");
      return NextResponse.json({ assetId: asset.id }, { status: 201 });
    } catch (error) {
      await objectStorage.delete(key).catch(() => null);
      throw error;
    }
  } catch (error) {
    return handleApiError(error, "creative-work.inspirations.POST");
  }
}
