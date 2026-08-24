import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { apiError, handleApiError } from "@/lib/api-response";
import { reviewTrainingAssetSchema } from "@/server/brand-training/contracts";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getClientProfile,
  getTrainingReferences,
  reviewTrainingReference,
} from "@/server/repositories/client-reference";
import { getWorkspaceAssetByKey, updateWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { compileBrandKnowledgeCandidates } from "@/server/brand-knowledge/candidate-compiler";
import { createBrandKnowledgeCandidates } from "@/server/repositories/brand-knowledge";

/**
 * PATCH /api/client-profiles/:id/training-assets/:referenceId
 *
 * Authenticated review for a brand training asset (approve, archive, or reject).
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

    const references = await getTrainingReferences(workspace.id, id);
    const reference = references.find((row) => row.id === referenceId);
    if (!reference) {
      return apiError("clientProfileNotFound", 404);
    }
    if (
      body.reviewStatus === "approved" &&
      reference.reviewStatus !== "pending_approval" &&
      reference.reviewStatus !== "approved" &&
      reference.reviewStatus !== "rejected"
    ) {
      return apiError("clientProfileNotFound", 404);
    }
    if (
      body.reviewStatus === "approved" &&
      reference.reviewStatus === "pending_approval" &&
      body.analysis == null
    ) {
      return apiError("invalidInput", 400);
    }
    if (body.reviewStatus === "rejected" && !body.rejectionReason) {
      return apiError("invalidInput", 400);
    }
    if (
      body.reviewStatus === "rejected" &&
      reference.reviewStatus !== "pending_approval" &&
      reference.reviewStatus !== "approved" &&
      reference.reviewStatus !== "archived" &&
      reference.reviewStatus !== "rejected"
    ) {
      return apiError("clientProfileNotFound", 404);
    }

    // Exact mode needs alpha only when approving — archive must not be blocked
    // by compositing rules for an asset leaving the training set.
    if (body.reviewStatus === "approved" && body.usageMode === "exact") {
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
        analysis: body.analysis ?? reference.trainingAnalysis ?? null,
        reviewStatus: body.reviewStatus,
        rejectionReason: body.rejectionReason ?? null,
        reviewedByUserId: user.id,
      },
    );

    if (!updated) {
      return apiError("clientProfileNotFound", 404);
    }

    if (body.reviewStatus === "approved" && updated.trainingAnalysis) {
      const asset = await getWorkspaceAssetByKey(workspace.id, updated.assetKey);
      const metadata = asset?.metadata as { sha256?: unknown } | null;
      if (!asset) return apiError("invalidInput", 400);
      const sourceHash = typeof metadata?.sha256 === "string"
        ? metadata.sha256
        : createHash("sha256").update(await objectStorage.get(updated.assetKey)).digest("hex");
      if (metadata?.sha256 !== sourceHash) {
        await updateWorkspaceAsset(asset.id, workspace.id, {
          metadata: { ...(asset.metadata as Record<string, unknown> | null), sha256: sourceHash },
        });
      }
      await createBrandKnowledgeCandidates(
        workspace.id,
        id,
        compileBrandKnowledgeCandidates({
          evidence: { type: "training_asset", id: updated.id, sourceHash },
          approvedAsset: {
            assetKey: updated.assetKey,
            category: updated.trainingCategory ?? body.trainingCategory,
            usageMode: updated.usageMode ?? body.usageMode,
            rules: updated.trainingAnalysis.rules,
            constraints: updated.trainingAnalysis.constraints,
            confidence: updated.trainingAnalysis.confidence,
            structure: updated.trainingAnalysis.structure,
          },
        }),
      );
    }

    return NextResponse.json({ reference: updated });
  } catch (error) {
    return handleApiError(error, "client-profiles.[id].training-assets.[referenceId].PATCH");
  }
}
