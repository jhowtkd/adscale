import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runQualityImprovement } from "@/server/human-quality/improvement/service";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";

const MAX_API_COMPARISONS = 100;

const querySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  cohort: z.enum(HUMAN_QUALITY_CORPUS_COHORTS).optional(),
  improvementDeployedAt: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      cohort: searchParams.get("cohort") ?? undefined,
      improvementDeployedAt: searchParams.get("improvementDeployedAt") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    await requireCalibrationAccess(request, parsed.data.workspaceId ?? null);

    const cachedRun = unstable_cache(
      async (input: Parameters<typeof runQualityImprovement>[0]) =>
        runQualityImprovement(input),
      ["quality-improvement"],
      { revalidate: 60, tags: ["quality-improvement"] }
    );
    const { report, comparisons } = await cachedRun({
      workspaceId: parsed.data.workspaceId,
      cohort: parsed.data.cohort,
      improvementDeployedAt: parsed.data.improvementDeployedAt,
    });

    const totalComparisonCount = comparisons.length;
    const truncated = totalComparisonCount > MAX_API_COMPARISONS;
    const cappedComparisons = truncated
      ? comparisons.slice(0, MAX_API_COMPARISONS)
      : comparisons;

    return NextResponse.json({
      report: {
        ...report,
        comparisons: cappedComparisons,
        ...(truncated
          ? { truncated: true as const, totalComparisonCount }
          : { truncated: false as const, totalComparisonCount }),
      },
    });
  } catch (error) {
    return handleApiError(error, "feedback.quality-improvement.GET");
  }
}
