import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import { buildClientLearningProposals } from "@/server/human-quality/learning/aggregate";
import {
  findActiveProposalBySlice,
  insertClientLearningProposal,
} from "@/server/repositories/client-learning-proposal";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";

const bodySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
});

export async function POST(request: Request) {
  try {
    await requirePlatformOwner(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const rows = await listEvaluatedCorpusWithEvaluations({
      workspaceId: parsed.data.workspaceId,
      cohort: parsed.data.cohort,
    });

    const built = buildClientLearningProposals(rows);
    const proposals = [];

    for (const proposal of built) {
      const existing = await findActiveProposalBySlice(
        proposal.workspaceId,
        proposal.clientProfileId,
        proposal.sliceKey
      );
      if (existing) {
        continue;
      }
      proposals.push(await insertClientLearningProposal(proposal));
    }

    return NextResponse.json({ generated: proposals.length, proposals });
  } catch (error) {
    return handleApiError(error, "admin.quality.learning.proposals.generate.POST");
  }
}
