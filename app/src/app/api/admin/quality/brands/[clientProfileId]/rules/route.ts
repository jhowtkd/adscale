import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmCalibrationRuleMetadata, mapRuleRowToCandidate } from "@/server/brand-taste/calibration-rules";
import { confirmedGuidanceMetadataSchema } from "@/server/brand-taste/guidance-metadata";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { listCalibrationRulesForClientProfile } from "@/server/repositories/calibration-rule";
import type { CalibrationRule } from "@/server/db/schema";

const paramsSchema = z.object({
  clientProfileId: z.string().uuid(),
});

const patchSchema = z.object({
  action: z.literal("confirm_metadata"),
  ruleId: z.string().uuid(),
  metadata: confirmedGuidanceMetadataSchema,
}).strict();

function serializeRule(row: CalibrationRule) {
  return { ...mapRuleRowToCandidate(row), contentHash: hashGuidanceContent(row.rationale),
    confirmedMetadata: row.confirmedMetadata, metadataConfirmedBy: row.metadataConfirmedBy,
    metadataConfirmedAt: row.metadataConfirmedAt?.toISOString() ?? null };
}

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
      approved: approvedRows.map(serializeRule),
      candidate: candidateRows.map(serializeRule),
    });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.rules.GET");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ clientProfileId: string }> }) {
  try {
    const { user } = await requirePlatformOwner(request);
    const params = paramsSchema.safeParse(await context.params);
    const body = patchSchema.safeParse(await request.json());
    if (!params.success || !body.success) return apiError("validation_error", 400);
    const [profile] = await db.select({ id: clientProfiles.id, workspaceId: clientProfiles.workspaceId })
      .from(clientProfiles).where(eq(clientProfiles.id, params.data.clientProfileId)).limit(1);
    if (!profile) return apiError("not_found", 404);
    const result = await confirmCalibrationRuleMetadata({ workspaceId: profile.workspaceId,
      clientProfileId: profile.id, ruleId: body.data.ruleId, metadata: body.data.metadata, confirmedBy: user.id });
    if (!result.ok) return apiError(result.reason, result.reason === "not_found" ? 404
      : result.reason === "content_changed" || result.reason === "rule_not_approved" ? 409 : 400);
    return NextResponse.json({ rule: serializeRule(result.rule) });
  } catch (error) {
    return handleApiError(error, "admin.quality.brands.rules.PATCH");
  }
}
