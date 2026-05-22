import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { createShareToken } from "@/lib/share-token";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  derivationIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: Request) {
  try {
    const limit = rateLimit(request, "general");
    if (!limit.success) {
      return apiError("rateLimitExceeded", 429);
    }

    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const { campaignId, derivationIds } = parsed.data;

    const { shareUrl, expiresAt } = await createShareToken(
      campaignId,
      workspace.id,
      derivationIds
    );

    return NextResponse.json({ shareUrl, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return handleApiError(error, "share.POST");
  }
}
