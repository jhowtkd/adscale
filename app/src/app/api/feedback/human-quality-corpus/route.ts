import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/platform-owner";
import { FeedbackValidationError } from "@/server/feedback/validate-refs";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import {
  HumanQualityServiceError,
  listPendingCorpusQueue,
  selectDerivationForCorpus,
} from "@/server/human-quality/service";

const selectCorpusSchema = z.object({
  workspaceId: z.string().uuid(),
  campaignId: z.string().uuid(),
  derivationId: z.string().uuid(),
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
  corpusVersion: z.number().int().min(1).max(100).optional(),
  artifactRef: z.record(z.string(), z.unknown()).optional(),
  qualitySnapshot: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return apiError("validation_error", 400, { field: "workspaceId" });
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      return apiError("validation_error", 400, { field: "limit" });
    }

    const items = await listPendingCorpusQueue({ workspaceId, limit });

    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error, "feedback.human-quality-corpus.GET");
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    const parsed = selectCorpusSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const item = await selectDerivationForCorpus({
      ...parsed.data,
      selectedByUserId: user.id,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return apiError(error.code, 400);
    }

    if (error instanceof HumanQualityServiceError) {
      if (error.code === "duplicate_corpus_item") {
        return apiError(error.code, 409);
      }
      if (error.code === "forbidden_corpus_payload") {
        return apiError(error.code, 400);
      }
      return apiError(error.code, 400);
    }

    return handleApiError(error, "feedback.human-quality-corpus.POST");
  }
}
