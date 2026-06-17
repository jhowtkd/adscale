import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runScoreCalibration } from "@/server/human-quality/calibration/service";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";

const MAX_API_COMPARISONS = 100;

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      cohort: searchParams.get("cohort") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    await requireCalibrationAccess(request, parsed.data.workspaceId ?? null);

    const { report, persistedAdjustments } = await runScoreCalibration({
      workspaceId: parsed.data.workspaceId,
      cohort: parsed.data.cohort,
      capturedAt: new Date().toISOString(),
    });

    const totalComparisonCount = report.visualMetrics.comparisons.length;
    const truncated = totalComparisonCount > MAX_API_COMPARISONS;
    const comparisons = truncated
      ? report.visualMetrics.comparisons.slice(0, MAX_API_COMPARISONS)
      : report.visualMetrics.comparisons;

    return NextResponse.json({
      report: {
        ...report,
        visualMetrics: {
          ...report.visualMetrics,
          comparisons,
        },
        ...(truncated
          ? { truncated: true as const, totalComparisonCount }
          : { truncated: false as const, totalComparisonCount }),
      },
      persistedAdjustmentCount: persistedAdjustments.length,
    });
  } catch (error) {
    return handleApiError(error, "feedback.score-calibration.GET");
  }
}
