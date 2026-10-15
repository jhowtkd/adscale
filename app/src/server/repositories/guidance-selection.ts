import { and, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import { calibrationRuleRevisions, calibrationRules, guidanceSelections } from "../db/schema";
import { mapGuidanceHistoryRevision } from "../brand-taste/guidance-history";
import type { GuidanceSelection, NumericGuidanceRef } from "../brand-taste/guidance-selection-types";

type Scope = { workspaceId: string; clientProfileId: string };
type Reader = Pick<typeof db, "select">;
export function serializeGuidanceSelection(row?: typeof guidanceSelections.$inferSelect): GuidanceSelection {
  return row ? { version: row.version, refs: row.refs, pinnedBy: row.pinnedBy,
    pinnedAt: row.pinnedAt?.toISOString() ?? null, previousSelection: row.previousSelection ?? null }
    : { version: 0, refs: [], pinnedBy: null, pinnedAt: null, previousSelection: null };
}
export async function getGuidanceSelection(scope: Scope, reader: Reader = db): Promise<GuidanceSelection> {
  const [row] = await reader.select().from(guidanceSelections).where(and(eq(guidanceSelections.workspaceId, scope.workspaceId),
    eq(guidanceSelections.clientProfileId, scope.clientProfileId))).limit(1);
  return serializeGuidanceSelection(row);
}

/** Resolve only exact immutable references; the live projection can veto retirement, never supply replacement bytes. */
export async function resolveGuidanceSelection(scope: Scope, refs: readonly NumericGuidanceRef[], reader: Reader = db) {
  if (!refs.length) return [];
  const rows = await reader.select({ revision: calibrationRuleRevisions, currentStatus: calibrationRules.status,
    retired: sql<boolean>`exists (select 1 from ${calibrationRuleRevisions} retired
      where retired.rule_id = ${calibrationRuleRevisions.ruleId} and retired.revision_number > ${calibrationRuleRevisions.revisionNumber}
      and retired.snapshot->>'status' in ('deprecated', 'rejected'))`,
  })
    .from(calibrationRuleRevisions).innerJoin(calibrationRules, eq(calibrationRules.id, calibrationRuleRevisions.ruleId))
    .where(and(eq(calibrationRuleRevisions.workspaceId, scope.workspaceId), eq(calibrationRuleRevisions.clientProfileId, scope.clientProfileId),
      eq(calibrationRules.workspaceId, scope.workspaceId), eq(calibrationRules.clientProfileId, scope.clientProfileId),
      or(...refs.map(ref => and(eq(calibrationRuleRevisions.ruleId, ref.ruleId),
        eq(calibrationRuleRevisions.revisionNumber, ref.revision), eq(calibrationRuleRevisions.contentHash, ref.contentHash))))));
  return refs.map(ref => {
    const row = rows.find(row => row.revision.ruleId === ref.ruleId && row.revision.revisionNumber === ref.revision && row.revision.contentHash === ref.contentHash);
    return { ref, revision: row ? mapGuidanceHistoryRevision(row.revision) : null, currentStatus: row?.currentStatus ?? null, retired: row?.retired ?? false };
  });
}
