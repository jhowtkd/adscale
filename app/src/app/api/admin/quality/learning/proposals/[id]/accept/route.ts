import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  acceptClientLearningProposal,
  ClientLearningProposalError,
} from "@/server/human-quality/learning/proposals";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id } = await context.params;

    const result = await acceptClientLearningProposal({
      proposalId: id,
      reviewerUserId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ClientLearningProposalError) {
      if (error.code === "not_proposed") {
        return apiError(error.code, 404);
      }
      if (error.code === "insufficient_evidence") {
        return apiError(error.code, 422);
      }
    }

    return handleApiError(error, "admin.quality.learning.proposals.accept.POST");
  }
}
