import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import { detectAndPersistCrossClientGlobalProposals } from "@/server/human-quality/learning/cross-client";
import { generateAndPersistClientLearningProposals } from "@/server/human-quality/learning/generate";

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

    const { generated, proposals } = await generateAndPersistClientLearningProposals({
      workspaceId: parsed.data.workspaceId,
      cohort: parsed.data.cohort,
    });

    const globalProposals = await detectAndPersistCrossClientGlobalProposals();

    return NextResponse.json({
      generated,
      proposals,
      globalProposals: globalProposals.length,
    });
  } catch (error) {
    return handleApiError(error, "admin.quality.learning.proposals.generate.POST");
  }
}
