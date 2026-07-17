import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { buildIdentityOptions } from "@/server/creative-work/identity";

/**
 * Returns a category-priority ordered recommendation list of approved brand
 * references for the wizard's assets step. The list is computed from the
 * work item's brief + client profile, never from the request body — the
 * server is the single source of truth for the order, the AI justification,
 * and the eligibility filter.
 *
 * Empty results are not an error: a brand with no approved references
 * simply yields `[]`, and the wizard surfaces an empty-state CTA.
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

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    const brief = existing.work.brief;
    if (
      !brief ||
      !brief.theme?.trim() ||
      !brief.objective?.trim() ||
      !brief.audience?.trim() ||
      !brief.offer?.trim()
    ) {
      return apiError("work_not_prepared", 409);
    }

    const options = await buildIdentityOptions(
      workspace.id,
      existing.work.clientProfileId,
      brief,
    );

    return NextResponse.json({ options });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].identity-options.GET");
  }
}
