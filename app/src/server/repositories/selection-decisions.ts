import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { creativeWorkSelectionDecisions, type CreativeWorkSelectionDecision } from "../db/schema";
import { canonicalJsonStringify } from "../creative-work/canonical-json";

export type SelectionDecisionRequest = {
  userId: string;
  requestKey: string;
  authorType?: "human" | "agent";
  actorId?: string;
  choice: CreativeWorkSelectionDecision["choice"];
};

export class SelectionDecisionConflict extends Error {
  readonly code = "selection_decision_conflict";
}

export function assertSelectionDecisionReplay(
  decision: CreativeWorkSelectionDecision,
  input: SelectionDecisionRequest & { workItemId: string; outputId: string },
): void {
  if ((decision.authorType ?? "human") !== (input.authorType ?? "human") ||
      (decision.actorId ?? null) !== (input.actorId ?? null) ||
      decision.userId !== input.userId || decision.workItemId !== input.workItemId ||
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
