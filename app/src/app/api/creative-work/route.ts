import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getClientProfile } from "@/server/repositories/client-reference";
import { createCreativeWork } from "@/server/repositories/creative-work";
import { createCreativeWorkSchema } from "@/server/creative-work/contracts";

/**
 * Standalone create-post workflow: kick off a new work item in `draft` status.
 * Validates the profile belongs to the authenticated workspace before writing
 * anything.
 */
export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireWorkspaceAccess(request);

    const parsed = createCreativeWorkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("invalidInput", 400, parsed.error.flatten());
    }

    const profile = await getClientProfile(workspace.id, parsed.data.clientProfileId);
    if (!profile) {
      return apiError("clientProfileNotFound", 404);
    }

    const work = await createCreativeWork({
      workspaceId: workspace.id,
      clientProfileId: parsed.data.clientProfileId,
      createdByUserId: user.id,
      toolKind: parsed.data.toolKind,
      brief: parsed.data.brief,
      format: parsed.data.format,
    });

    return NextResponse.json({ work }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "creative-work.POST");
  }
}