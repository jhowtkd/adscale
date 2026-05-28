import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { deleteCampaign } from "@/server/repositories/campaign";
import { getAssetsByCampaign } from "@/server/repositories/asset";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { ObjectStorage } from "@/server/storage/object-storage";
import { deleteKeys } from "@/server/storage/storage-helpers";

export function createDeleteHandler({ storage }: { storage: ObjectStorage }) {
  return async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    try {
      const { workspace } = await requireWorkspaceAccess(request);
      const { id } = await params;

      const assets = await getAssetsByCampaign(id, workspace.id);
      const derivations = await getDerivationsByCampaign(id, workspace.id);
      const keysToDelete: string[] = [
        ...assets.map((a) => a.key),
        ...derivations.map((d) => d.outputKey).filter((k): k is string => !!k),
      ];

      const campaign = await deleteCampaign(id, workspace.id);

      if (!campaign) {
        return apiError("campaignNotFound", 404);
      }

      await deleteKeys(storage, keysToDelete);

      return NextResponse.json({ success: true });
    } catch (error) {
      return handleApiError(error, "campaigns.[id].DELETE");
    }
  };
}
