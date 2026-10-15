import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { mapGuidanceHistoryRevision, resolveGuidanceHistoryReference } from "../brand-taste/guidance-history";
import type { LearnedGuidanceRef } from "../brand-taste/learned-guidance";
import { calibrationRuleRevisions } from "../db/schema";

export async function listCalibrationRuleHistory(input: { workspaceId: string; clientProfileId: string }) {
  const rows = await db.select().from(calibrationRuleRevisions).where(and(
    eq(calibrationRuleRevisions.workspaceId, input.workspaceId),
    eq(calibrationRuleRevisions.clientProfileId, input.clientProfileId),
  )).orderBy(asc(calibrationRuleRevisions.ruleId), asc(calibrationRuleRevisions.revisionNumber));
  return rows.map(mapGuidanceHistoryRevision);
}

export async function resolveCalibrationRuleHistoryReference(input: { workspaceId: string; clientProfileId: string; reference: LearnedGuidanceRef }) {
  return resolveGuidanceHistoryReference(await listCalibrationRuleHistory(input), input.reference);
}
