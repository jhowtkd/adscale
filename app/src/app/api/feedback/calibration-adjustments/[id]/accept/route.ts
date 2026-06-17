import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { CalibrationAdjustmentError } from "@/server/repositories/calibration-adjustment-errors";
import { acceptProposedAdjustment } from "@/server/human-quality/improvement/accept";
import { qualityImprovementChangeSpecSchema } from "@/server/human-quality/improvement/types";

const acceptBodySchema = z.object({
  changeSpec: qualityImprovementChangeSpecSchema.optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireCalibrationAccess(request);
    const { id: adjustmentId } = await context.params;

    const parsed = acceptBodySchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const adjustment = await acceptProposedAdjustment({
      adjustmentId,
      reviewerUserId: user.id,
      changeSpec: parsed.data.changeSpec,
    });

    return NextResponse.json({ adjustment });
  } catch (error) {
    if (error instanceof CalibrationAdjustmentError) {
      if (error.code === "adjustment_not_found") {
        return apiError(error.code, 404);
      }
      if (error.code === "insufficient_evidence") {
        return apiError(error.code, 422);
      }
      return apiError(error.code, 409);
    }

    return handleApiError(error, "feedback.calibration-adjustments.accept.PATCH");
  }
}
