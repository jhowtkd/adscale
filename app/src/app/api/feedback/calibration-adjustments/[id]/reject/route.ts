import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireCalibrationAccess } from "@/server/auth/calibration-access";
import { CalibrationAdjustmentError } from "@/server/repositories/calibration-adjustment-errors";
import { rejectAdjustment } from "@/server/repositories/rubric-calibration-adjustments";

const rejectBodySchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireCalibrationAccess(request);
    const { id: adjustmentId } = await context.params;

    const parsed = rejectBodySchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const adjustment = await rejectAdjustment({
      adjustmentId,
      reviewerUserId: user.id,
      reason: parsed.data.reason,
    });

    return NextResponse.json({ adjustment });
  } catch (error) {
    if (error instanceof CalibrationAdjustmentError) {
      if (error.code === "adjustment_not_found") {
        return apiError(error.code, 404);
      }
      return apiError(error.code, 409);
    }

    return handleApiError(error, "feedback.calibration-adjustments.reject.PATCH");
  }
}
