import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmSocialPostWork } from "@/server/application/confirm-social-post-work";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import { socialPostCopySchema } from "@/server/creative-work/contracts";
import {
  failStaleCreativeWorkOutputs,
  getCreativeWork,
  refreshCreativeWorkStatus,
} from "@/server/repositories/creative-work";

const GENERATION_LEASE_MS = 15 * 60 * 1000;

const confirmCreativeWorkSchema = z
  .object({
    // Legacy wizard body — mapped to CanonicalBriefing write inside the command.
    copy: socialPostCopySchema,
    // Empty is allowed: Create Post can lock a Brand-Kit-only identity
    // snapshot when the brand has no approved training references yet.
    selectedReferenceIds: z.array(z.string().uuid()).max(8),
  })
  .strict();

/**
 * Standalone create-post detail. Attaches CanonicalCreativeWork projection
 * (Phase 5 / item 36).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);
    const staleOutputs = await failStaleCreativeWorkOutputs(
      workspace.id,
      id,
      new Date(Date.now() - GENERATION_LEASE_MS),
    );
    if (staleOutputs.length > 0) {
      await refreshCreativeWorkStatus(workspace.id, id);
    }
    const result = await getCreativeWork(workspace.id, id);
    if (!result) {
      return apiError("creativeWorkNotFound", 404);
    }
    const canonical = projectCreativeWorkAsCanonicalWork(
      result.work,
      result.outputs
    );
    return NextResponse.json({
      work: result.work,
      outputs: result.outputs,
      canonical,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].GET");
  }
}

/**
 * Confirm the work: persist copy (via canonical briefing map) and lock
 * identity snapshot. Domain: confirmSocialPostWork (Phase 5 / item 36).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const parsed = confirmCreativeWorkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await confirmSocialPostWork({
      workspaceId: workspace.id,
      workItemId: id,
      copy: parsed.data.copy,
      selectedReferenceIds: parsed.data.selectedReferenceIds,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "invalid_copy":
          return apiError("invalidInput", 400);
        case "identity_reference_not_approved":
          return apiError("identityReferenceNotApproved", 422, {
            referenceId: result.error.referenceId,
          });
        case "identity_reference_missing_alpha":
          return apiError("identityReferenceMissingAlpha", 422, {
            referenceId: result.error.referenceId,
            category: result.error.category,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({
      work: result.value.work,
      canonical: result.value.canonical,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].PATCH");
  }
}
