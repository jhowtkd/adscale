import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getStudioEntryContext } from "@/server/application/get-studio-entry-context";
import { isStudioCarouselEnabled } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";

export async function GET(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const rateLimitResult = await checkRateLimit(request, { category: "read", workspaceId: workspace.id });
    if (rateLimitResult) return rateLimitResult;

    const clientProfileId = new URL(request.url).searchParams.get("clientProfileId");
    const parsed = z.string().uuid().safeParse(clientProfileId);
    if (!parsed.success) return apiError("invalidInput", 400);

    const carouselEnabled = isStudioCarouselEnabled(workspace.id, env.STUDIO_CAROUSEL_ROLLOUT_PERCENT);
    const result = await getStudioEntryContext({
      workspaceId: workspace.id,
      clientProfileId: parsed.data,
      carouselEnabled,
    });
    if (!result.ok) return apiError("notFound", 404);
    return NextResponse.json(result.context);
  } catch (error) {
    return handleApiError(error, "creative-work.entry-context.GET");
  }
}
