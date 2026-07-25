import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  HUMAN_QUALITY_FAILURE_REASONS,
  HUMAN_QUALITY_INTENTS,
} from "@/server/human-quality/corpus";
import {
  HumanQualityServiceError,
  submitHumanEvaluation,
} from "@/server/human-quality/service";

const corpusLogger = logger.child("human-quality-corpus");

const submitEvaluationSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  visualScore: z.number().int().min(0).max(100),
  factualPass: z.boolean(),
  intent: z.enum(HUMAN_QUALITY_INTENTS),
  primaryFailureReason: z.enum(HUMAN_QUALITY_FAILURE_REASONS),
  otherReasonText: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { id: corpusItemId } = await context.params;
    const parsed = submitEvaluationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const result = await submitHumanEvaluation({
      workspaceId: parsed.data.workspaceId,
      corpusItemId,
      reviewerUserId: user.id,
      visualScore: parsed.data.visualScore,
      factualPass: parsed.data.factualPass,
      intent: parsed.data.intent,
      primaryFailureReason: parsed.data.primaryFailureReason,
      otherReasonText: parsed.data.otherReasonText,
      notes: parsed.data.notes,
    });

    if (!parsed.data.workspaceId) {
      corpusLogger.info("global corpus evaluation", {
        userId: user.id,
        action: "evaluate",
        corpusItemId,
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof HumanQualityServiceError) {
      if (error.code === "corpus_item_not_found") {
        return apiError(error.code, 404);
      }
      if (error.code === "corpus_item_not_pending") {
        return apiError(error.code, 409);
      }
      if (error.code === "corpus_evaluation_duplicate") {
        return apiError(error.code, 409);
      }
      if (error.code === "corpus_item_workspace_mismatch") {
        return apiError(error.code, 400);
      }
      return apiError(error.code, 400);
    }

    return handleApiError(error, "feedback.human-quality-corpus.evaluation.POST");
  }
}
