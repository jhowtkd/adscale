import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { generateSocialPostCopy } from "@/server/application/generate-social-post-copy";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

/**
 * Generate (or return the persisted) social post copy for a work item.
 * Domain: generateSocialPostCopy (Phase 5 / item 36).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const result = await generateSocialPostCopy({
      workspaceId: workspace.id,
      workItemId: id,
      userId: user.id,
      returnPath: `/quick-tools/create-post?workId=${id}`,
    });

    if (!result.ok) {
      switch (result.error.code) {
        case "work_not_found":
          return apiError("creativeWorkNotFound", 404);
        case "client_profile_not_found":
          return apiError("clientProfileNotFound", 404);
        case "credit_blocked":
          return apiError(
            result.error.spend.conversionPayload.reason,
            402,
            result.error.spend.conversionPayload
          );
        case "provider_unavailable":
          return apiError("copyProviderUnavailable", 502, {
            creativeWorkId: id,
          });
        default:
          return apiError("invalidRequest", 400);
      }
    }

    return NextResponse.json({
      copy: result.value.copy,
      work: result.value.work,
      canonical: result.value.canonical,
    });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].copy.POST");
  }
}
