import { createHash } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkSelectionDecisions, creativeWorkOutputs, creativeWorkItems, type CreativeWorkSelectionDecision } from "../db/schema";
import { canonicalJsonStringify } from "../creative-work/canonical-json";

export type SelectionDecisionRequest = {
  userId: string;
  requestKey: string;
  choice: CreativeWorkSelectionDecision["choice"];
};

export class SelectionDecisionConflict extends Error {
  readonly code = "selection_decision_conflict";
}

export function assertSelectionDecisionReplay(
  decision: CreativeWorkSelectionDecision,
  input: SelectionDecisionRequest & { workItemId: string; outputId: string },
): void {
  if (decision.userId !== input.userId || decision.workItemId !== input.workItemId ||
      decision.outputId !== input.outputId || canonicalJsonStringify(decision.choice) !== canonicalJsonStringify(input.choice)) {
    throw new SelectionDecisionConflict("Esta chave já identifica outra decisão de seleção.");
  }
}

export async function findSelectionDecision(
  workspaceId: string,
  requestKey: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<CreativeWorkSelectionDecision | null> {
  const [row] = await executor.select().from(creativeWorkSelectionDecisions).where(and(
    eq(creativeWorkSelectionDecisions.workspaceId, workspaceId),
    eq(creativeWorkSelectionDecisions.requestKey, requestKey),
  )).limit(1);
  return row ?? null;
}

/** Resolve only the human decision for the actual replaced Peça, in the same scope. */
export async function findPreviousSelectionDecision(decision: CreativeWorkSelectionDecision): Promise<CreativeWorkSelectionDecision | null> {
  if (!decision.previousDecisionId || !decision.previousOutputId || decision.previousOutputId === decision.outputId) return null;
  const [previous] = await db.select().from(creativeWorkSelectionDecisions).where(and(
    eq(creativeWorkSelectionDecisions.id, decision.previousDecisionId),
    eq(creativeWorkSelectionDecisions.workspaceId, decision.workspaceId),
    eq(creativeWorkSelectionDecisions.workItemId, decision.workItemId),
    eq(creativeWorkSelectionDecisions.outputId, decision.previousOutputId),
    sql`${creativeWorkSelectionDecisions.clientProfileId} is not distinct from ${decision.clientProfileId}`,
    sql`${creativeWorkSelectionDecisions.sequence} < ${decision.sequence}`,
  )).limit(1);
  return previous ?? null;
}

/** Shared by the historical support report and prospective proposal queries.
 * Sequence, rather than projection time, identifies the last deliberate choice.
 * An unconfirmed agent choice does not become current human support.
 */
export function selectionDecisionIsCurrentSql() {
  return sql<boolean>`
    not exists (select 1 from ${creativeWorkSelectionDecisions} later
      where later.workspace_id = ${creativeWorkSelectionDecisions}.${sql.identifier("workspace_id")}
        and later.work_item_id = ${creativeWorkSelectionDecisions}.${sql.identifier("work_item_id")}
        and later.sequence > ${creativeWorkSelectionDecisions}.${sql.identifier("sequence")})
    and exists (select 1 from ${creativeWorkOutputs} current_output
      inner join ${creativeWorkItems} current_work on current_work.id = current_output.work_item_id
      where current_output.workspace_id = ${creativeWorkSelectionDecisions}.${sql.identifier("workspace_id")}
        and current_work.workspace_id = ${creativeWorkSelectionDecisions}.${sql.identifier("workspace_id")}
        and current_work.client_profile_id = ${creativeWorkSelectionDecisions}.${sql.identifier("client_profile_id")}
        and current_output.work_item_id = ${creativeWorkSelectionDecisions}.${sql.identifier("work_item_id")}
        and current_output.id = ${creativeWorkSelectionDecisions}.${sql.identifier("output_id")}
        and current_output.is_selected = true and current_output.selected_by = 'operator')`;
}

export function groupSelectionDecisionSupport(history: readonly { decision: CreativeWorkSelectionDecision; isCurrent: boolean }[]) {
  const groups = new Map<string, { groupKey: string; decisionIds: string[]; currentDecisionId: string | null }>();
  for (const { decision, isCurrent } of history) {
    const groupKey = createHash("sha256").update(canonicalJsonStringify([
      decision.workspaceId, decision.clientProfileId, decision.userId, decision.workItemId, decision.contextSnapshot,
    ])).digest("hex");
    const group = groups.get(groupKey) ?? { groupKey, decisionIds: [], currentDecisionId: null };
    group.decisionIds.push(decision.id);
    if (isCurrent) group.currentDecisionId = decision.id;
    groups.set(groupKey, group);
  }
  return [...groups.values()];
}

/** Append-only sequence for reporting; grouping never drops the underlying decisions. */
export async function listSelectionDecisionSupport(scope: { workspaceId: string; clientProfileId: string }) {
  const history = await db.select({ decision: creativeWorkSelectionDecisions, isCurrent: selectionDecisionIsCurrentSql() })
    .from(creativeWorkSelectionDecisions).where(and(
      eq(creativeWorkSelectionDecisions.workspaceId, scope.workspaceId),
      eq(creativeWorkSelectionDecisions.clientProfileId, scope.clientProfileId),
    )).orderBy(asc(creativeWorkSelectionDecisions.sequence));
  return { history, groups: groupSelectionDecisionSupport(history) };
}
