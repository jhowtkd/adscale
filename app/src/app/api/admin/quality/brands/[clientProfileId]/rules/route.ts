import { getGuidanceSelection } from "@/server/repositories/guidance-selection";
import { pinGuidanceSelection, revertGuidanceSelection, GuidanceSelectionError } from "@/server/brand-taste/guidance-selection";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { confirmCalibrationRuleMetadata, mapRuleRowToCandidate } from "@/server/brand-taste/calibration-rules";
import { confirmedGuidanceMetadataSchema } from "@/server/brand-taste/guidance-metadata";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { RULE_STATUSES } from "@/server/brand-taste/calibration-signal-types";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { listCalibrationRulesForClientProfile } from "@/server/repositories/calibration-rule";
import { listCalibrationRuleHistory } from "@/server/repositories/calibration-rule-history";
import type { CalibrationRule } from "@/server/db/schema";
import { decideCalibrationRule, GuidanceDecisionError } from "@/server/brand-taste/guidance-decisions";
import { expectedProposalRevisionSchema } from "@/server/brand-taste/proposal-review";

const paramsSchema = z.object({
  clientProfileId: z.string().uuid(),
});

const patchSchema = z.discriminatedUnion("action", [z.object({
  action: z.literal("pin_selection"), expectedVersion: z.number().int().nonnegative(),
  refs: z.array(z.object({ ruleId: z.string().uuid(), revision: z.number().int().positive(), contentHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict()),
}).strict(), z.object({
  action: z.literal("revert_selection"), expectedVersion: z.number().int().nonnegative(),
}).strict(), z.object({
  action: z.literal("confirm_metadata"),
  ruleId: z.string().uuid(),
  metadata: confirmedGuidanceMetadataSchema,
}).strict(), ...(["reject", "deprecate"] as const).map(action => z.object({
  action: z.literal(action), ruleId: z.string().uuid(),
  expectedRevision: expectedProposalRevisionSchema, reason: z.string().trim().min(1).max(1000),
}).strict())]);

function serializeRule(row: CalibrationRule) {
  return { ...mapRuleRowToCandidate(row), contentHash: hashGuidanceContent(row.rationale),
    reviewDecision: row.reviewDecision ?? null, confirmedMetadata: row.confirmedMetadata, metadataConfirmedBy: row.metadataConfirmedBy,
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
      })).map(serializeRule),
    ]));

    return NextResponse.json({
      clientProfileId: profile.id,
      workspaceId: profile.workspaceId,
      ...Object.fromEntries(groups),
      selection: await getGuidanceSelection({ workspaceId: profile.workspaceId, clientProfileId: profile.id }),
      history: await listCalibrationRuleHistory({ workspaceId: profile.workspaceId, clientProfileId: profile.id }),
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
    if (body.data.action === "revert_selection") {
      const selection = await revertGuidanceSelection({ expectedVersion: body.data.expectedVersion, workspaceId: profile.workspaceId,
        clientProfileId: profile.id, reviewerUserId: user.id });
      return NextResponse.json({ selection });
    }
    if (body.data.action === "pin_selection") {
      const selection = await pinGuidanceSelection({ refs: body.data.refs, expectedVersion: body.data.expectedVersion, workspaceId: profile.workspaceId,
        clientProfileId: profile.id, reviewerUserId: user.id });
      return NextResponse.json({ selection });
    }
    if (body.data.action !== "confirm_metadata") {
      const rule = await decideCalibrationRule({ ...body.data, workspaceId: profile.workspaceId,
        clientProfileId: profile.id, reviewerUserId: user.id });
      return NextResponse.json({ rule: serializeRule(rule),
        history: await listCalibrationRuleHistory({ workspaceId: profile.workspaceId, clientProfileId: profile.id }) });
    }
    const result = await confirmCalibrationRuleMetadata({ workspaceId: profile.workspaceId,
      clientProfileId: profile.id, ruleId: body.data.ruleId, metadata: body.data.metadata, confirmedBy: user.id });
    if (!result.ok) return apiError(result.reason, result.reason === "not_found" ? 404
      : result.reason === "content_changed" || result.reason === "rule_not_approved" ? 409 : 400);
    return NextResponse.json({ rule: serializeRule(result.rule),
      history: await listCalibrationRuleHistory({ workspaceId: profile.workspaceId, clientProfileId: profile.id }) });
  } catch (error) {
    if (error instanceof GuidanceSelectionError) return NextResponse.json({ error: error.message, code: error.code },
      { status: error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "selection_conflict" || error.code === "no_previous_selection" ? 409 : 422 });
    if (error instanceof GuidanceDecisionError) return NextResponse.json({ error: error.message, code: error.code,
      ...(error.current ? { current: error.current } : {}) }, { status: error.code === "forbidden" ? 403
        : error.code === "not_found" ? 404 : error.code === "reason_required" ? 422 : 409 });
    if (error instanceof SyntaxError) return apiError("validation_error", 400);
    return handleApiError(error, "admin.quality.brands.rules.PATCH");
  }
}
