import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { startSocialPostWork } from "@/server/application/start-social-post-work";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createCreativeWorkSchema } from "@/server/creative-work/contracts";

/**
 * Criar Post create — HTTP adapter only (Phase 5 / items 34–35).
 * Domain: startSocialPostWork (intent social_post, no campaign).
 */
export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const parsed = createCreativeWorkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const result = await startSocialPostWork({
      workspaceId: workspace.id,
      userId: user.id,
      clientProfileId: parsed.data.clientProfileId,
      format: parsed.data.format,
      brief: parsed.data.brief,
    });

    if (!result.ok) {
      if (result.error.code === "client_profile_not_found") {
        return apiError("clientProfileNotFound", 404);
      }
      return apiError("invalidRequest", 400);
    }

    // `work` kept for existing UI; `canonical` is the Phase 5 contract.
    return NextResponse.json(
      {
        work: result.value.work,
        canonical: result.value.canonical,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "creative-work.POST");
  }
}
