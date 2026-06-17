import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { runLearningImpact } from "@/server/human-quality/impact/service";
import { HUMAN_QUALITY_CORPUS_COHORTS } from "@/server/human-quality/corpus";

const MAX_API_ROWS = 100;

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

    const { report } = await runLearningImpact({
      workspaceId: parsed.data.workspaceId,
      cohort: parsed.data.cohort,
      capturedAt: new Date().toISOString(),
    });

    const totalRowCount = report.rows.length;
    const truncated = totalRowCount > MAX_API_ROWS;
    const rows = truncated ? report.rows.slice(0, MAX_API_ROWS) : report.rows;

    return NextResponse.json({
      report: {
        ...report,
        rows,
        ...(truncated
          ? { truncated: true as const, totalRowCount }
          : { truncated: false as const, totalRowCount }),
      },
    });
  } catch (error) {
    return handleApiError(error, "feedback.learning-impact.GET");
  }
}
