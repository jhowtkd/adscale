import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { runGuidanceImpact } from "@/server/human-quality/guidance-impact/service";
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
  mechanism: z.enum(["client_output_learnings", "guidance_revisions"]).optional(),
  clientProfileId: z.string().uuid().optional(),
}).superRefine((query, context) => {
  if (query.mechanism === "guidance_revisions" ? !query.clientProfileId || query.cohort : query.clientProfileId) {
    context.addIssue({ code: "custom", message: "Guidance revisions require a brand scope and do not use recommendation cohorts." });
  }
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      cohort: searchParams.get("cohort") ?? undefined,
      mechanism: searchParams.get("mechanism") ?? undefined,
      clientProfileId: searchParams.get("clientProfileId") ?? undefined,
    });

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    await requireCalibrationAccess(request, parsed.data.workspaceId ?? null);

    if (parsed.data.mechanism === "guidance_revisions") {
      const [profile] = await db.select({ id: clientProfiles.id, workspaceId: clientProfiles.workspaceId })
        .from(clientProfiles).where(eq(clientProfiles.id, parsed.data.clientProfileId!)).limit(1);
      if (!profile || (parsed.data.workspaceId && parsed.data.workspaceId !== profile.workspaceId)) return apiError("not_found", 404);
      const report = await runGuidanceImpact({ workspaceId: profile.workspaceId, clientProfileId: profile.id });
      return NextResponse.json({ report }, { headers: { "Cache-Control": "private, no-store" } });
    }

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
