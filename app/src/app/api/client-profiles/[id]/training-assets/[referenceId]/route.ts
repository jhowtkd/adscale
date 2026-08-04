import { NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api-response";
import { reviewTrainingAssetSchema } from "@/server/brand-training/contracts";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getClientProfile,
  getTrainingReferences,
  reviewTrainingReference,
} from "@/server/repositories/client-reference";
import { getWorkspaceAssetByKey } from "@/server/repositories/workspace-asset";

/**
 * PATCH /api/client-profiles/:id/training-assets/:referenceId
 *
 * Authenticated review for a brand training asset (archive, or adjust
 * category/mode on an already-approved upload). New uploads are
 * auto-approved on create; this route remains for archive / edits.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; referenceId: string }> },
) {
  try {
    const [{ user, workspace }, { id, referenceId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    // Defense-in-depth: validate the body twice — once at the API boundary
    // and once here so any future caller cannot bypass it.
    const rawBody = await request.json();
    const parsed = reviewTrainingAssetSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError("invalidInput", 400);
    }
    const body = parsed.data;

    const profile = await getClientProfile(workspace.id, id);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    // Exact mode needs alpha only when approving — archive must not be blocked
    // by compositing rules for an asset leaving the training set.
    if (body.reviewStatus === "approved" && body.usageMode === "exact") {
      const references = await getTrainingReferences(workspace.id, id);
      const reference = references.find((row) => row.id === referenceId);
      if (!reference) {
        return apiError("clientProfileNotFound", 404);
      }
      const asset = await getWorkspaceAssetByKey(workspace.id, reference.assetKey);
      const metadata = asset?.metadata as Record<string, unknown> | null | undefined;
      const hasAlpha = metadata?.hasAlpha === true;
      if (!hasAlpha) {
        return apiError("invalidInput", 400);
      }
    }

    const updated = await reviewTrainingReference(
      { workspaceId: workspace.id, clientProfileId: id, referenceId },
      {
        trainingCategory: body.trainingCategory,
        usageMode: body.usageMode,
        analysis: body.analysis ?? null,
        reviewStatus: body.reviewStatus,
        reviewedByUserId: user.id,
      },
    );

    if (!updated) {
      return apiError("clientProfileNotFound", 404);
    }

    return NextResponse.json({ reference: updated });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].training-assets.[referenceId].PATCH");
  }
}