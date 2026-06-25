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
}

function appendJobRef(existing: JobRef[], jobRef?: JobRef): JobRef[] {
  if (!jobRef) return existing;
  const duplicate = existing.some(
    (ref) => ref.kind === jobRef.kind && ref.id === jobRef.id
  );
  if (duplicate) return existing;
  return [...existing, jobRef];
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
    inputSnapshot?: Record<string, unknown>;
    display?: Record<string, unknown>;
  }
) {
  const action = await getAssistantActionById(workspaceId, actionId);
  if (!action) {
    return null;
  }

  const currentStatus = action.status as ActionStatus;
  if (!isValidActionTransition(currentStatus, nextStatus)) {
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

  const jobRefs = appendJobRef(
    (action.jobRefs ?? []) as JobRef[],
    patch?.jobRef
  );

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
