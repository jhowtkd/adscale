import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { assistantMessages, assistantThreads } from "../db/schema";
import {
  containsDeniedPersistenceKeys,
  type ActionStatus,
  type JobRef,
  type MessageType,
  type ToolMessagePayload,
} from "./assistant-types";
import { getAssistantThreadById } from "./assistant-thread";

export class AssistantMessageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantMessageValidationError";
  }
}

type BaseMessageInput = {
  threadId: string;
  content: string;
  payload?: Record<string, unknown>;
};

export interface UserMessageAttachment {
  assetId: string;
  key: string;
  url?: string;
  type: string;
  name: string;
  size: number;
}

export type CreateAssistantMessageInput =
  | (BaseMessageInput & {
      type: "user";
      payload?: { attachments?: UserMessageAttachment[] };
    })
  | (BaseMessageInput & { type: "assistant"; payload?: Record<string, never> })
  | (BaseMessageInput & { type: "tool"; payload: ToolMessagePayload })
  | (BaseMessageInput & {
      type: "action_card";
      payload: {
        actionRecordId: string;
        status: ActionStatus;
        display: Record<string, unknown>;
      };
      actionRecordId?: string;
    });

function validatePayload(type: MessageType, payload: Record<string, unknown>) {
  if (containsDeniedPersistenceKeys(payload)) {
    throw new AssistantMessageValidationError(
      "Payload contains denied persistence keys"
    );
  }

  if (type === "tool") {
    if (typeof payload.toolName !== "string" || !payload.toolName.trim()) {
      throw new AssistantMessageValidationError("tool messages require toolName");
    }
    if (typeof payload.summary !== "string" || !payload.summary.trim()) {
      throw new AssistantMessageValidationError("tool messages require summary");
    }
    if ("rawArgs" in payload) {
      throw new AssistantMessageValidationError("tool messages cannot include rawArgs");
    }
  }
}

/**
 * Callers (Phase 179) must invoke createAssistantMessage for assistant type only
 * after streaming completes — this repository does not buffer partial streams.
 */
export async function createAssistantMessage(
  workspaceId: string,
  input: CreateAssistantMessageInput
) {
  const thread = await getAssistantThreadById(workspaceId, input.threadId);
  if (!thread) {
    throw new AssistantMessageValidationError("Thread not found");
  }

  const payload = (input.payload ?? {}) as Record<string, unknown>;
  validatePayload(input.type, payload);

  const [row] = await db
    .insert(assistantMessages)
    .values({
      workspaceId,
      threadId: input.threadId,
      sequence: sql`(SELECT COALESCE(MAX(${assistantMessages.sequence}), 0) + 1 FROM ${assistantMessages} WHERE ${assistantMessages.threadId} = ${input.threadId})`,
      type: input.type,
      content: input.content,
      payload,
      actionRecordId:
        input.type === "action_card"
          ? (input.payload.actionRecordId ?? input.actionRecordId ?? null)
          : null,
    })
    .returning();

  await touchAssistantThread(workspaceId, input.threadId);

  return row;
}

export const DEFAULT_ASSISTANT_MESSAGE_LIST_LIMIT = 100;

export async function listAssistantMessages(
  workspaceId: string,
  threadId: string,
  options?: { limit?: number }
) {
  const limit = options?.limit ?? DEFAULT_ASSISTANT_MESSAGE_LIST_LIMIT;
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.workspaceId, workspaceId),
        eq(assistantMessages.threadId, threadId)
      )
    )
    .orderBy(desc(assistantMessages.sequence))
    .limit(limit);

  return rows.reverse();
}

export async function updateActionCardPayload(
  workspaceId: string,
  messageId: string,
  patch: {
    status?: ActionStatus;
    display?: Record<string, unknown>;
    safeError?: string | null;
    jobRef?: JobRef;
  }
) {
  const [existing] = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.id, messageId),
        eq(assistantMessages.workspaceId, workspaceId),
        eq(assistantMessages.type, "action_card")
      )
    )
    .limit(1);

  if (!existing) {
    return null;
  }

  const currentPayload = (existing.payload ?? {}) as Record<string, unknown>;
  const display =
    patch.display !== undefined
      ? { ...(currentPayload.display as Record<string, unknown>), ...patch.display }
      : currentPayload.display;

  const nextPayload: Record<string, unknown> = {
    ...currentPayload,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(display !== undefined ? { display } : {}),
    ...(patch.safeError !== undefined ? { safeError: patch.safeError } : {}),
    ...(patch.jobRef !== undefined ? { jobRef: patch.jobRef } : {}),
  };

  if (containsDeniedPersistenceKeys(nextPayload)) {
    throw new AssistantMessageValidationError(
      "Payload contains denied persistence keys"
    );
  }

  const [updated] = await db
    .update(assistantMessages)
    .set({ payload: nextPayload })
    .where(
      and(
        eq(assistantMessages.id, messageId),
        eq(assistantMessages.workspaceId, workspaceId)
      )
    )
    .returning();

  return updated ?? null;
}

export async function linkMessageToActionRecord(
  workspaceId: string,
  messageId: string,
  actionRecordId: string
) {
  const [updated] = await db
    .update(assistantMessages)
    .set({ actionRecordId })
    .where(
      and(
        eq(assistantMessages.id, messageId),
        eq(assistantMessages.workspaceId, workspaceId)
      )
    )
    .returning();

  return updated ?? null;
}

export async function touchAssistantThread(workspaceId: string, threadId: string) {
  await db
    .update(assistantThreads)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(assistantThreads.id, threadId),
        eq(assistantThreads.workspaceId, workspaceId)
      )
    );
}

export async function getAssistantMessageById(workspaceId: string, messageId: string) {
  const [row] = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.id, messageId),
        eq(assistantMessages.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return row ?? null;
}
