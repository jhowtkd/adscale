import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { mapRuleRowToCandidate } from "@/server/brand-taste/calibration-rules";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { listCalibrationRulesForClientProfile } from "@/server/repositories/calibration-rule";

const paramsSchema = z.object({
  clientProfileId: z.string().uuid(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ clientProfileId: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const rawParams = await context.params;
    const parsed = paramsSchema.safeParse(rawParams);

    if (!parsed.success) {
      return apiError("validation_error", 400);
    }

    const { clientProfileId } = parsed.data;

    const [profile] = await db
      .select({
        id: clientProfiles.id,
        workspaceId: clientProfiles.workspaceId,
      })
      .from(clientProfiles)
      .where(eq(clientProfiles.id, clientProfileId))
      .limit(1);

    if (!profile) {
      return apiError("not_found", 404);
    }

    const [approvedRows, candidateRows] = await Promise.all([
      listCalibrationRulesForClientProfile({
        workspaceId: profile.workspaceId,
        clientProfileId: profile.id,
        status: "approved",
      }),
      listCalibrationRulesForClientProfile({
        workspaceId: profile.workspaceId,
        clientProfileId: profile.id,
        status: "candidate",
      }),
    ]);

    return NextResponse.json({
      clientProfileId: profile.id,
      workspaceId: profile.workspaceId,
      approved: approvedRows.map(mapRuleRowToCandidate),
      candidate: candidateRows.map(mapRuleRowToCandidate),
    });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.rules.GET");
  }
}
