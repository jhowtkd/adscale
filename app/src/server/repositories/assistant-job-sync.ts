import { inArray } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";
import type { ActionStatus, JobRef } from "./assistant-types";
import {
  getAssistantActionById,
  sanitizeSafeError,
  transitionAssistantAction,
} from "./assistant-action";
import { getAssistantThreadById } from "./assistant-thread";
import { transitionGuidedFlowAfterAction } from "@/server/assistant/guided-paths/action-integration";

export type DerivationJobStatus = "processing" | "completed" | "failed";

const STATUS_MAP: Record<DerivationJobStatus, ActionStatus> = {
  processing: "running",
  completed: "completed",
  failed: "failed",
};

export interface SyncAssistantActionFromJobInput {
  workspaceId: string;
  actionId: string;
  status: DerivationJobStatus;
  jobRef?: JobRef;
  safeError?: string | null;
}

/**
 * Derivation statuses that count as "still in flight" for aggregate completion.
 * A goal-agent action tracks multiple derivation jobs; the action stays running
 * until every expected job reaches a terminal status.
 */
const ACTIVE_DERIVATION_STATUSES = ["queued", "processing"];

/**
 * Computes the aggregate action status from the full set of referenced
 * derivations. Rules:
 * - while any expected derivation is still active, the action is `running`;
 * - the action is `completed` only when every expected job is terminal AND at
 *   least one produced an output (otherwise it is a no-op failure);
 * - the action is `failed` only when every expected job has failed.
 */
function deriveAggregateStatus(
  refs: JobRef[],
  statuses: string[],
): ActionStatus {
  if (statuses.length < refs.length) {
    return "running";
  }
  const anyActive = statuses.some((status) =>
    ACTIVE_DERIVATION_STATUSES.includes(status),
  );
  if (anyActive) {
    return "running";
  }
  const allFailed = statuses.every((status) =>
    ["failed", "rejected"].includes(status),
  );
  if (allFailed) {
    return "failed";
  }
  // Every job terminal and at least one succeeded (a non-failure status implies
  // an output exists for that derivation).
  const anySucceeded = statuses.some(
    (status) => !["failed", "rejected"].includes(status),
  );
  return anySucceeded ? "completed" : "failed";
}

export async function syncAssistantActionFromJob(input: SyncAssistantActionFromJobInput) {
  const action = await getAssistantActionById(input.workspaceId, input.actionId);
  if (!action) {
    return null;
  }

  // For aggregate (multi-job) actions, recompute the action status from the full
  // set of expected derivation jobs so we never complete on the first callback.
  const derivationRefs = ((action.jobRefs ?? []) as JobRef[]).filter(
    (ref) => ref.kind === "derivation",
  );

  let aggregateStatus: ActionStatus = STATUS_MAP[input.status];
  if (derivationRefs.length > 1) {
    const derivationIds = derivationRefs.map((ref) => ref.id);
    const rows = await db
      .select({ id: derivations.id, status: derivations.status })
      .from(derivations)
      .where(inArray(derivations.id, derivationIds));
    aggregateStatus = deriveAggregateStatus(
      derivationRefs,
      rows.map((row) => row.status),
    );

  }

  // Apply exactly one transition after the aggregate is known. This prevents a
  // completed child from prematurely completing the parent and then requiring
  // the forbidden completed -> running transition while siblings are active.
  await transitionAssistantAction(input.workspaceId, input.actionId, aggregateStatus, {
    jobRef: input.jobRef,
    safeError:
      aggregateStatus === "failed" ? sanitizeSafeError(input.safeError) : null,
  });

  // Fire the guided-flow / goal callback only once the aggregate is terminal,
  // so downstream transitions see the true final result.
  if (aggregateStatus === "completed" || aggregateStatus === "failed") {
    const thread = await getAssistantThreadById(input.workspaceId, action.threadId);
    if (thread) {
      await transitionGuidedFlowAfterAction({
        workspaceId: input.workspaceId,
        threadId: action.threadId,
        clientProfileId: thread.clientProfileId,
        actionId: input.actionId,
        result: aggregateStatus === "completed" ? "completed" : "failed",
        safeError: input.safeError ?? undefined,
        campaignId: thread.campaignId,
      }).catch(() => null);
    }
  }

  return await getAssistantActionById(input.workspaceId, input.actionId);
}
