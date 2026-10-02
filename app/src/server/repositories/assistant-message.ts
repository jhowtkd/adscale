import { HANDOFF_STEPS, type HandoffStep } from "../equipe/domain/handoff";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { assistantMessages, assistantThreads } from "../db/schema";
import {
  containsDeniedPersistenceKeys,
  type ActionStatus,
  type EquipeCardPayload,
  type EquipeEventPayload,
  type JobRef,
  type MessageType,
  type StaffMessagePayload,
  type ToolMessagePayload,
} from "./assistant-types";
import type { PostgresEquipeExecutor } from "../equipe/data/postgres";
import { filterSuggestions } from "@/lib/equipe/suggestions";

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
      payload?: { attachments?: UserMessageAttachment[]; fromSuggestion?: boolean };
    })
  | (BaseMessageInput & { type: "assistant"; payload?: { suggestions?: string[] } })
  | (BaseMessageInput & { type: "tool"; payload: ToolMessagePayload })
  | (BaseMessageInput & {
      type: "action_card";
      payload: {
        actionRecordId: string;
        status: ActionStatus;
        display: Record<string, unknown>;
      };
      actionRecordId?: string;
    })
  | (BaseMessageInput & { type: "equipe_card"; payload: EquipeCardPayload })
  | (BaseMessageInput & { type: "equipe_event"; payload: EquipeEventPayload })
  | (BaseMessageInput & { type: "staff_message"; payload: StaffMessagePayload });

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateEquipeCardPayload(payload: Record<string, unknown>) {
  if (payload.kind !== "item" && payload.kind !== "batch" && payload.kind !== "idea" && payload.kind !== "plan_offer" && payload.kind !== "handoff" && payload.kind !== "diagnosis") {
    throw new AssistantMessageValidationError(
      "equipe_card messages require kind item, batch, idea, plan_offer, handoff or diagnosis"
    );
  }
  if (!isNonEmptyString(payload.accountId)) {
    throw new AssistantMessageValidationError("equipe_card messages require accountId");
  }
  if (!isNonEmptyString(payload.title)) {
    throw new AssistantMessageValidationError("equipe_card messages require title");
  }
  if (!Array.isArray(payload.items)) {
    throw new AssistantMessageValidationError("equipe_card messages require items");
  }
  if ((payload.kind === "item" || payload.kind === "batch") && payload.items.length === 0) {
    throw new AssistantMessageValidationError(
      "equipe_card item/batch messages require at least one item"
    );
  }
  if (payload.kind === "handoff" && (!isNonEmptyString(payload.handoffId) || !HANDOFF_STEPS.includes(payload.step as HandoffStep) || payload.items.length !== 0)) {
    throw new AssistantMessageValidationError("handoff messages require handoffId, a valid step and no approval items");
  }
  if (payload.kind === "plan_offer" && payload.items.length !== 0) {
    throw new AssistantMessageValidationError("plan_offer messages cannot include approval items");
  }
  if (payload.kind === "diagnosis") {
    const finished = payload.status === "ready" || payload.status === "insufficient";
    if (payload.items.length !== 0 || (!finished && payload.status !== "failed")) {
      throw new AssistantMessageValidationError("diagnosis messages require a status and no approval items");
    }
    if (finished && (!isNonEmptyString(payload.documentId) || !isNonEmptyString(payload.summary) || !Array.isArray(payload.opportunities)
      || !Array.isArray(payload.channels) || !Array.isArray(payload.notFound))) {
      throw new AssistantMessageValidationError("finished diagnosis messages require documentId, summary, channels, opportunities and notFound");
    }
    if (payload.suggestions !== undefined && JSON.stringify(payload.suggestions) !== JSON.stringify(filterSuggestions(payload.suggestions))) {
      throw new AssistantMessageValidationError("diagnosis suggestions must be valid conversation starters");
    }
  }
  if (payload.items.length > 50) {
    throw new AssistantMessageValidationError("equipe_card messages hold at most 50 items");
  }
  for (const item of payload.items) {
    const ref = item as Record<string, unknown> | null;
    if (
      !ref ||
      typeof ref !== "object" ||
      !isNonEmptyString(ref.itemId) ||
      !isNonEmptyString(ref.versionHash)
    ) {
      throw new AssistantMessageValidationError(
        "equipe_card items require itemId and versionHash"
      );
    }
  }
  if (payload.kind === "idea" && !isNonEmptyString(payload.ideaId)) {
    throw new AssistantMessageValidationError("equipe_card idea messages require ideaId");
  }
}

function validateEquipeEventPayload(payload: Record<string, unknown>) {
  if (!isNonEmptyString(payload.kind)) {
    throw new AssistantMessageValidationError("equipe_event messages require kind");
  }
  if (!isNonEmptyString(payload.text)) {
    throw new AssistantMessageValidationError("equipe_event messages require text");
  }
}

function validateStaffMessagePayload(payload: Record<string, unknown>) {
  if (!isNonEmptyString(payload.staffId)) {
    throw new AssistantMessageValidationError("staff_message messages require staffId");
  }
  if (!isNonEmptyString(payload.name)) {
    throw new AssistantMessageValidationError("staff_message messages require name");
  }
}

function validatePayload(type: MessageType, payload: Record<string, unknown>) {
  if (containsDeniedPersistenceKeys(payload)) {
    throw new AssistantMessageValidationError(
      "Payload contains denied persistence keys"
    );
  }
  if (type === "user" && payload.fromSuggestion !== undefined && typeof payload.fromSuggestion !== "boolean") {
    throw new AssistantMessageValidationError("fromSuggestion must be boolean");
  }
  if (type === "assistant" && payload.suggestions !== undefined
    && JSON.stringify(payload.suggestions) !== JSON.stringify(filterSuggestions(payload.suggestions))) {
    throw new AssistantMessageValidationError("assistant suggestions must be valid conversation starters");
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

  if (type === "equipe_card") {
    validateEquipeCardPayload(payload);
  }

  if (type === "equipe_event") {
    validateEquipeEventPayload(payload);
  }

  if (type === "staff_message") {
    validateStaffMessagePayload(payload);
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
  return db.transaction((tx) => createAssistantMessageInTransaction(tx, workspaceId, input));
}

/** The Equipe projection supplies its source event UUID as the message id. */
export async function createAssistantMessageInTransaction(
  executor: PostgresEquipeExecutor,
  workspaceId: string,
  input: CreateAssistantMessageInput,
  sourceEventId?: string,
) {
  return (await insertAssistantMessage(executor, workspaceId, input, sourceEventId)).row;
}

/**
 * Posts a plan_offer card unless the thread already carries one. The lookup
 * runs under the thread's row lock, the one every message insert takes, so two
 * turns racing on the same thread (two tabs, two devices) cannot both offer:
 * the second gets the first one's card back, with `created: false`.
 */
export async function createAssistantPlanOfferOnce(workspaceId: string, input: CreateAssistantMessageInput) {
  if (input.type !== "equipe_card" || input.payload.kind !== "plan_offer") {
    throw new AssistantMessageValidationError("only a plan_offer card can be posted once");
  }
  return db.transaction((tx) => insertAssistantMessage(tx, workspaceId, input, undefined, true));
}

async function insertAssistantMessage(
  executor: PostgresEquipeExecutor,
  workspaceId: string,
  input: CreateAssistantMessageInput,
  sourceEventId?: string,
  unlessPlanOffer = false,
) {
  // Serialize sequence allocation with every other message on this thread.
  const [thread] = await executor.select().from(assistantThreads).where(and(
    eq(assistantThreads.workspaceId, workspaceId), eq(assistantThreads.id, input.threadId),
  )).for("update");
  if (!thread) throw new AssistantMessageValidationError("Thread not found");
  const payload = (input.payload ?? {}) as Record<string, unknown>;
  validatePayload(input.type, payload);
  if (sourceEventId) {
    const [existing] = await executor.select().from(assistantMessages)
      .where(eq(assistantMessages.id, sourceEventId));
    if (existing) {
      if (existing.workspaceId !== workspaceId || existing.threadId !== input.threadId) {
        throw new AssistantMessageValidationError("Message source belongs to another thread");
      }
      return { row: existing, created: false };
    }
  }
  if (unlessPlanOffer) {
    const [offer] = await executor.select().from(assistantMessages).where(and(
      eq(assistantMessages.threadId, input.threadId),
      eq(assistantMessages.type, "equipe_card"),
      sql`${assistantMessages.payload} ->> 'kind' = 'plan_offer'`,
    )).limit(1);
    if (offer) return { row: offer, created: false };
  }
  const [row] = await executor.insert(assistantMessages).values({
    ...(sourceEventId ? { id: sourceEventId } : {}),
    workspaceId,
    threadId: input.threadId,
    sequence: sql`(SELECT COALESCE(MAX(${assistantMessages.sequence}), 0) + 1 FROM ${assistantMessages} WHERE ${assistantMessages.threadId} = ${input.threadId})`,
    type: input.type,
    content: input.content,
    payload,
    actionRecordId: input.type === "action_card"
      ? (input.payload.actionRecordId ?? input.actionRecordId ?? null) : null,
    // The app's clock, in UTC: `created_at` has no time zone, so the database's now() would write the SERVER's wall clock, and a Postgres
    // outside UTC (a developer's machine in America/Sao_Paulo) made the card of the diagnosis appear 3 hours in the past (ticket 13, D-3).
    createdAt: new Date(),
  }).returning();
  await executor.update(assistantThreads).set({ updatedAt: new Date() }).where(and(
    eq(assistantThreads.workspaceId, workspaceId), eq(assistantThreads.id, input.threadId),
  ));
  return { row, created: true };
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
    jobRefs?: JobRef[];
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
    // The card payload mirrors the full job-ref set so the UI can show
    // aggregate progress instead of only the most recent callback.
    ...(patch.jobRefs !== undefined ? { jobRefs: patch.jobRefs } : {}),
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
