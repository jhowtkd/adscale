import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  CorpusCandidatePromotionError,
  promoteCorpusCandidateToQueue,
} from "@/server/human-quality/candidate-promotion";
import { HUMAN_QUALITY_CORPUS_COHORTS, HUMAN_QUALITY_SOURCE_LABELS } from "@/server/human-quality/corpus";

const corpusLogger = logger.child("human-quality-corpus");

const promoteSchema = z.object({
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS),
  sourceLabel: z.enum(HUMAN_QUALITY_SOURCE_LABELS).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id: candidateId } = await context.params;
    const parsed = promoteSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const result = await promoteCorpusCandidateToQueue({
      candidateId,
      cohort: parsed.data.cohort,
      selectedByUserId: user.id,
      sourceLabel: parsed.data.sourceLabel,
    });

    corpusLogger.info("corpus candidate promoted", {
      userId: user.id,
      action: "promote",
      candidateId,
      corpusItemId: result.item.id,
      created: result.created,
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof CorpusCandidatePromotionError) {
      if (error.code === "candidate_not_found") {
        return apiError(error.code, 404);
      }
      return apiError(error.code, 400);
    }

    return handleApiError(error, "feedback.human-quality-corpus.candidates.promote.POST");
  }
}
