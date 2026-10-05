import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import {
  retryTrainingAnalysisSchema,
  reviewTrainingAssetSchema,
} from "@/server/brand-training/contracts";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  getClientProfile,
  getTrainingReferences,
  markTrainingAnalysisFailed,
  retryTrainingAnalysis,
  reviewTrainingReference,
} from "@/server/repositories/client-reference";
import { getWorkspaceAssetByKey, updateWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { compileBrandKnowledgeCandidates } from "@/server/brand-knowledge/candidate-compiler";
import { createBrandKnowledgeCandidates } from "@/server/repositories/brand-knowledge";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { processRaster } from "@/server/equipe/handoff/raster-image";

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

    const rawBody = await request.json();
    const retryAction = retryTrainingAnalysisSchema.safeParse(rawBody);

    if (retryAction.success) {
      const profile = await getClientProfile(workspace.id, id);
      if (!profile) {
        return apiError("clientProfileNotFound", 404);
      }

      const references = await getTrainingReferences(workspace.id, id);
      const reference = references.find((row) => row.id === referenceId);
      if (!reference || reference.reviewStatus !== "analysis_failed") {
        return apiError("clientProfileNotFound", 404);
      }

      const asset = await getWorkspaceAssetByKey(workspace.id, reference.assetKey);
      if (!asset) {
        return apiError("invalidInput", 400);
      }

      const metadata = asset.metadata as Record<string, unknown> | null | undefined;
      // Promoted Piece references may lack upload metadata. Match the original
      // Piece transparency verdict, with decoding confined to the raster child.
      const hasAlpha = typeof metadata?.hasAlpha === "boolean"
        ? metadata.hasAlpha
        : (await processRaster(await objectStorage.get(reference.assetKey), "transparency", {
            accountKey: `classic:${workspace.id}`,
            signal: request.signal,
          })).info.usableTransparency === true;

      const scope = { workspaceId: workspace.id, clientProfileId: id, referenceId };
      const updated = await retryTrainingAnalysis(scope);
      if (!updated) {
        return apiError("clientProfileNotFound", 404);
      }

      try {
        await inngest.send({
          name: heavyImageEventName("brand.training.analyze"),
          data: {
            workspaceId: workspace.id,
            clientProfileId: id,
            referenceId: updated.id,
            assetKey: updated.assetKey,
            mimeType: asset.type,
            hasAlpha,
          },
        });
      } catch (error) {
        logger.error(`[brandTrainingRetry] DISPATCH_FAILED referenceId=${referenceId}`, error);
        // A retry request without a dispatched job must remain actionable.
        // This CAS cannot clobber a concurrent actor that already advanced it.
        try {
          await markTrainingAnalysisFailed(scope);
        } catch (compensationError) {
          logger.error(
            `[brandTrainingRetry] COMPENSATION_FAILED referenceId=${referenceId}`,
            compensationError,
          );
        }
        throw error;
      }

      return NextResponse.json({ reference: updated });
    }

    // Defense-in-depth: validate the review body at the API boundary so any
    // future caller cannot bypass the review contract.
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
