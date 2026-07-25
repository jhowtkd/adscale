import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listClientLearningProposals } from "@/server/repositories/client-learning-proposal";

const querySchema = z.object({
  status: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  clientProfileId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined,
      workspaceId: url.searchParams.get("workspaceId") ?? undefined,
      clientProfileId: url.searchParams.get("clientProfileId") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const proposals = await listClientLearningProposals(parsed.data);
    return NextResponse.json({ proposals });
  } catch (error) {
    return handleApiError(error, "admin.quality.learning.proposals.GET");
  }
}
