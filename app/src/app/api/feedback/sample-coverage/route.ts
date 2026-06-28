import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";
import { runSampleCoverage } from "@/server/human-quality/sampling/service";

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

    const cachedRun = unstable_cache(
      async (input: Parameters<typeof runSampleCoverage>[0]) => (await runSampleCoverage(input)).report,
      ["sample-coverage"],
      { revalidate: 60, tags: ["sample-coverage"] }
    );
    const report = await cachedRun({
      workspaceId: parsed.data.workspaceId,
      cohort: parsed.data.cohort,
      capturedAt: new Date().toISOString(),
    });

    return NextResponse.json({ report });
  } catch (error) {
    return handleApiError(error, "feedback.sample-coverage.GET");
  }
}
