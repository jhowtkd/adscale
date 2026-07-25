import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import { runGlobalCorpusEvidence } from "@/server/human-quality/global-evidence-service";

const evidenceLogger = logger.child("global-corpus-evidence");

const querySchema = z.object({
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
  workspaceId: z.string().uuid().optional(),
  clientProfileId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      cohort: searchParams.get("cohort") ?? undefined,
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      clientProfileId: searchParams.get("clientProfileId") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const { report } = await runGlobalCorpusEvidence({
      cohort: parsed.data.cohort,
      workspaceId: parsed.data.workspaceId,
      clientProfileId: parsed.data.clientProfileId,
      capturedAt: new Date().toISOString(),
    });

    evidenceLogger.info("global corpus evidence", {
      userId: user.id,
      action: "read",
      evaluatedItemCount: report.evaluatedItemCount,
      operationalStatus: report.operationalStatus,
    });

    return NextResponse.json({ report });
  } catch (error) {
    return handleApiError(error, "feedback.global-corpus-evidence.GET");
  }
}
