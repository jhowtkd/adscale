import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { assistantActionRecords, assistantMessages, assistantThreads } from "../db/schema";
import {
  containsDeniedPersistenceKeys,
  type ActionStatus,
  type JobRef,
  isValidActionTransition,
} from "./assistant-types";
import { getAssistantThreadById } from "./assistant-thread";
import { touchAssistantThread, updateActionCardPayload } from "./assistant-message";

export class InvalidActionTransitionError extends Error {
  constructor(from: ActionStatus, to: ActionStatus) {
    super(`Invalid action transition: ${from} -> ${to}`);
    this.name = "InvalidActionTransitionError";
  }
}

export class AssistantActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantActionValidationError";
  }
}

const GENERIC_USER_ERROR = "Não foi possível concluir esta ação. Tente novamente.";

export function sanitizeSafeError(error?: string | null): string | null {
  if (!error) return null;
  if (error.includes("stack") || error.includes("Inngest") || /\n\s+at\s/.test(error)) {
    return GENERIC_USER_ERROR;
  }
  return error.length > 500 ? GENERIC_USER_ERROR : error;
}

export interface CreateAssistantActionInput {
  threadId: string;
  content: string;
  inputSnapshot: Record<string, unknown>;
  display?: Record<string, unknown>;
  sourceFlowRevision?: number | null;
  sourceSnapshotDigest?: string | null;
}

function appendJobRef(existing: JobRef[], jobRef?: JobRef): JobRef[] {
  if (!jobRef) return existing;
  const duplicate = existing.some(
    (ref) => ref.kind === jobRef.kind && ref.id === jobRef.id
  );
  if (duplicate) return existing;
  return [...existing, jobRef];
}

/**
 * Idempotently merges one or more job refs into the existing set. Multi-job
 * actions (e.g. a creative triplet) push every ref up front; repeated callbacks
 * for the same ref are deduped on (kind, id) so replays never duplicate.
 */
function mergeJobRefs(existing: JobRef[], additions: JobRef[]): JobRef[] {
  let result = existing;
  for (const ref of additions) {
    result = appendJobRef(result, ref);
  }
  return result;
}

export async function getAssistantActionById(workspaceId: string, actionId: string) {
  const [row] = await db
    .select()
    .from(assistantActionRecords)
    .where(
      and(
        eq(assistantActionRecords.id, actionId),
        eq(assistantActionRecords.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function createAssistantAction(
  workspaceId: string,
  input: CreateAssistantActionInput
) {
  const thread = await getAssistantThreadById(workspaceId, input.threadId);
  if (!thread) {
    throw new AssistantActionValidationError("Thread not found");
  }

  return db.transaction(async (tx) => {
    const actionId = crypto.randomUUID();
    const messagePayload = {
      actionRecordId: actionId,
      status: "pending" as const,
      display: input.display ?? {},
      sourceFlowRevision: input.sourceFlowRevision ?? null,
      sourceSnapshotDigest: input.sourceSnapshotDigest ?? null,
    };

    if (containsDeniedPersistenceKeys(messagePayload)) {
      throw new AssistantActionValidationError("Display payload contains denied keys");
    }

    const [message] = await tx
      .insert(assistantMessages)
      .values({
        workspaceId,
        threadId: input.threadId,
        sequence: sql`(SELECT COALESCE(MAX(${assistantMessages.sequence}), 0) + 1 FROM ${assistantMessages} WHERE ${assistantMessages.threadId} = ${input.threadId})`,
        type: "action_card",
        content: input.content,
        payload: messagePayload,
        actionRecordId: actionId,
      })
      .returning();

    const [action] = await tx
      .insert(assistantActionRecords)
      .values({
        id: actionId,
        workspaceId,
        threadId: input.threadId,
        messageId: message.id,
        status: "pending",
        inputSnapshot: input.inputSnapshot,
        jobRefs: [],
        sourceFlowRevision: input.sourceFlowRevision ?? null,
        sourceSnapshotDigest: input.sourceSnapshotDigest ?? null,
      })
      .returning();

    await tx
      .update(assistantThreads)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(assistantThreads.id, input.threadId),
          eq(assistantThreads.workspaceId, workspaceId)
        )
      );

    return { action, message };
  });
}

export async function transitionAssistantAction(
  workspaceId: string,
  actionId: string,
  nextStatus: ActionStatus,
  patch?: {
    safeError?: string | null;
    jobRef?: JobRef;
    jobRefs?: JobRef[];
    inputSnapshot?: Record<string, unknown>;
    display?: Record<string, unknown>;
  }
) {
  const action = await getAssistantActionById(workspaceId, actionId);
  if (!action) {
    return null;
  }

  const currentStatus = action.status as ActionStatus;

  // An identical status is an idempotent patch, not an error. Aggregate job
  // callbacks (e.g. three derivation jobs reporting running one after another)
  // merge their job refs and safe display data without throwing, then return
  // the current status. This keeps multi-job actions alive while any expected
  // job is still active.
  if (currentStatus !== nextStatus && !isValidActionTransition(currentStatus, nextStatus)) {
    throw new InvalidActionTransitionError(currentStatus, nextStatus);
  }

  if (currentStatus === "pending" && patch?.inputSnapshot) {
    throw new AssistantActionValidationError(
      "inputSnapshot is immutable while action is pending"
    );
  }

  const safeError =
    patch?.safeError !== undefined
      ? sanitizeSafeError(patch.safeError)
      : action.safeError;

  const additions = [
    ...(patch?.jobRef ? [patch.jobRef] : []),
    ...(patch?.jobRefs ?? []),
  ];
  const jobRefs = mergeJobRefs((action.jobRefs ?? []) as JobRef[], additions);

  const [updated] = await db
    .update(assistantActionRecords)
    .set({
      status: nextStatus,
      safeError,
      jobRefs,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(assistantActionRecords.id, actionId),
        eq(assistantActionRecords.workspaceId, workspaceId)
      )
    )
    .returning();

  if (!updated) {
    return null;
  }

  await updateActionCardPayload(workspaceId, action.messageId, {
    status: nextStatus,
    display: patch?.display,
    safeError,
    jobRefs,
  });
  await touchAssistantThread(workspaceId, action.threadId);

  return updated;
}

export async function confirmAssistantAction(workspaceId: string, actionId: string) {
  return transitionAssistantAction(workspaceId, actionId, "confirmed");
}

export async function cancelAssistantAction(
  workspaceId: string,
  actionId: string,
  safeError?: string
) {
  return transitionAssistantAction(workspaceId, actionId, "canceled", {
    safeError: safeError ?? "Ação cancelada.",
  });
}
