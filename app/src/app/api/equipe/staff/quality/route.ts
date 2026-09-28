import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { equipeErrorResponse } from "@/server/equipe/http/errors";
import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getQualityPipeline } from "@/server/equipe/module/calibration-queries";

const closedLimitSchema = z.coerce.number().int().min(1).max(200);

/**
 * GET /api/equipe/staff/quality — the quality pipeline: open rounds to
 * score, then recently closed ones (?closedLimit=, default 50). Only an
 * active quality staffer may read it; the module checks the binding.
 */
export async function GET(request: Request) {
  try {
    const guard = await equipeStaffContext(request);

    const rawLimit = new URL(request.url).searchParams.get("closedLimit");
    const closedLimit = rawLimit === null ? undefined : closedLimitSchema.safeParse(rawLimit);
    if (closedLimit !== undefined && !closedLimit.success) {
      return apiError("invalidInput", 400, closedLimit.error.flatten());
    }

    const quality = guard.staffRows.find((row) => row.role === "quality");
    if (!quality) return apiError("forbidden", 403);

    const outcome = await getQualityPipeline(
      guard.deps.uow.internal,
      quality.id,
      closedLimit === undefined ? {} : { closedLimit: closedLimit.data },
    );
    if (!outcome.ok) {
      return equipeErrorResponse(outcome.error, "equipe.staff.quality.GET");
    }
    return NextResponse.json(outcome.value);
  } catch (error) {
    return handleApiError(error, "equipe.staff.quality.GET");
  }
}
