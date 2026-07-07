import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  confirmCreativeWorkIdentity,
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import {
  createIdentitySnapshot,
  IdentitySnapshotMissingAlphaError,
  IdentitySnapshotMissingReferenceError,
} from "@/server/creative-work/identity";
import { socialPostCopySchema } from "@/server/creative-work/contracts";

const confirmCreativeWorkSchema = z
  .object({
    copy: socialPostCopySchema,
    selectedReferenceIds: z.array(z.string().uuid()).min(1).max(8),
  })
  .strict();

/**
 * Standalone create-post detail. The repository scopes the read by
 * `(workspaceId, id)` so a workspace mismatch yields `null` -> 404.
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
    const result = await getCreativeWork(workspace.id, id);
    if (!result) {
      return apiError("creativeWorkNotFound", 404);
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "creative-work.[id].GET");
  }
}

/**
 * Confirm the work: persist copy and lock the identity snapshot server-side.
 * The browser submits only `copy` and `selectedReferenceIds`; asset keys,
 * analysis, and Brand Kit content are reloaded from approved references.
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

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    // 1. Persist the copy first so the row carries it once the snapshot is
    //    attached.
    await setCreativeWorkCopy(workspace.id, id, parsed.data.copy);

    // 2. Build the immutable identity snapshot server-side. Asset keys,
    //    analysis, and Brand Kit content are reloaded from approved
    //    references — never trusted from the browser.
    const snapshot = await createIdentitySnapshot({
      workspaceId: workspace.id,
      clientProfileId: existing.work.clientProfileId,
      selectedReferenceIds: parsed.data.selectedReferenceIds,
    });

    // 3. Attach the snapshot and transition to `ready`.
    const work = await confirmCreativeWorkIdentity(workspace.id, id, snapshot);
    if (!work) {
      return apiError("creativeWorkNotFound", 404);
    }

    return NextResponse.json({ work });
  } catch (error) {
    if (error instanceof IdentitySnapshotMissingReferenceError) {
      return apiError("identityReferenceNotApproved", 422, {
        referenceId: error.missingId,
      });
    }
    if (error instanceof IdentitySnapshotMissingAlphaError) {
      return apiError("identityReferenceMissingAlpha", 422, {
        referenceId: error.referenceId,
        category: error.category,
      });
    }
    return handleApiError(error, "creative-work.[id].PATCH");
  }
}