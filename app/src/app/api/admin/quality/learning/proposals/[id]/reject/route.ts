import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  ClientLearningProposalError,
  rejectClientLearningProposal,
} from "@/server/human-quality/learning/proposals";

const bodySchema = z.object({
  reason: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id } = await context.params;

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const proposal = await rejectClientLearningProposal({
      proposalId: id,
      reviewerUserId: user.id,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof ClientLearningProposalError) {
      if (error.code === "missing_reason") {
        return apiError(error.code, 400);
      }
      if (error.code === "not_proposed") {
        return apiError(error.code, 404);
      }
    }

    return handleApiError(error, "admin.quality.learning.proposals.reject.POST");
  }
}
