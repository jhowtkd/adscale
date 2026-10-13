import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { LocalLearningAuthorizationError } from "@/server/brand-taste/local-learning-authorization";
import { CorpusConsentError } from "@/server/human-quality/corpus";
import {
  acceptClientLearningProposal,
  ClientLearningProposalError,
} from "@/server/human-quality/learning/proposals";

const bodySchema = z.object({
  acknowledgeFixtureOnly: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id } = await context.params;

    let acknowledgeFixtureOnly = false;
    const rawBody = await request.text();
    if (rawBody.trim()) {
      const parsed = bodySchema.safeParse(JSON.parse(rawBody));
      if (!parsed.success) {
        return apiError("validation_error", 400);
      }
      acknowledgeFixtureOnly = parsed.data.acknowledgeFixtureOnly ?? false;
    }

    const result = await acceptClientLearningProposal({
      proposalId: id,
      reviewerUserId: user.id,
      acknowledgeFixtureOnly,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LocalLearningAuthorizationError) return apiError(error.reason, 403);
    if (error instanceof CorpusConsentError) return apiError(error.code, 403);
    if (error instanceof ClientLearningProposalError) {
      if (error.code === "not_proposed") {
        return apiError(error.code, 404);
      }
      if (error.code === "client_consent_required") return apiError(error.code, 403);
      if (error.code === "insufficient_evidence" || error.code === "fixture_ack_required") {
        return apiError(error.code, 422);
      }
    }

    return handleApiError(error, "admin.quality.learning.proposals.accept.POST");
  }
}
