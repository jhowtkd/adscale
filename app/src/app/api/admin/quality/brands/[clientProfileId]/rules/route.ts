import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { mapRuleRowToCandidate } from "@/server/brand-taste/calibration-rules";
import { RULE_STATUSES } from "@/server/brand-taste/calibration-signal-types";
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
    const status = z.enum(RULE_STATUSES).optional().safeParse(new URL(request.url).searchParams.get("status") ?? undefined);
    if (!status.success) return apiError("validation_error", 400);

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

    const groups = await Promise.all(RULE_STATUSES.map(async state => [state,
      status.data && status.data !== state ? [] : (await listCalibrationRulesForClientProfile({
        workspaceId: profile.workspaceId, clientProfileId: profile.id, status: state,
      })).map(mapRuleRowToCandidate),
    ]));

    return NextResponse.json({
      clientProfileId: profile.id,
      workspaceId: profile.workspaceId,
      ...Object.fromEntries(groups),
    });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.rules.GET");
  }
}
