import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  assistantGuidedFlowEvents,
  type AssistantGuidedFlowEvent,
  type NewAssistantGuidedFlowEvent,
} from "../db/schema";
import { getAssistantThreadById } from "./assistant-thread";

export class GuidedFlowTelemetryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuidedFlowTelemetryValidationError";
  }
}

export interface GuidedFlowTelemetryListFilters {
  workspaceId: string;
  clientProfileId?: string;
  threadId?: string;
  path?: string;
  step?: string;
  eventKey?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

async function assertTelemetryScope(
  workspaceId: string,
  clientProfileId: string,
  threadId: string
) {
  const thread = await getAssistantThreadById(workspaceId, threadId);
  if (!thread) {
    throw new GuidedFlowTelemetryValidationError("Thread not found");
  }
  if (thread.clientProfileId !== clientProfileId) {
    throw new GuidedFlowTelemetryValidationError(
      "Client profile does not match thread scope"
    );
  }
  return thread;
}

export async function insertGuidedFlowTelemetryEvent(
  input: NewAssistantGuidedFlowEvent
): Promise<AssistantGuidedFlowEvent> {
  await assertTelemetryScope(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );

  const [event] = await db
    .insert(assistantGuidedFlowEvents)
    .values(input)
    .returning();

  return event;
}

function buildTelemetryConditions(filters: GuidedFlowTelemetryListFilters) {
  const conditions = [eq(assistantGuidedFlowEvents.workspaceId, filters.workspaceId)];

  if (filters.clientProfileId) {
    conditions.push(
      eq(assistantGuidedFlowEvents.clientProfileId, filters.clientProfileId)
    );
  }
  if (filters.threadId) {
    conditions.push(eq(assistantGuidedFlowEvents.threadId, filters.threadId));
  }
  if (filters.path) {
    conditions.push(eq(assistantGuidedFlowEvents.path, filters.path));
  }
  if (filters.step) {
    conditions.push(eq(assistantGuidedFlowEvents.step, filters.step));
  }
  if (filters.eventKey) {
    conditions.push(eq(assistantGuidedFlowEvents.eventKey, filters.eventKey));
  }
  if (filters.from) {
    conditions.push(gte(assistantGuidedFlowEvents.occurredAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(assistantGuidedFlowEvents.occurredAt, filters.to));
  }

  return conditions;
}

export async function listGuidedFlowTelemetryEvents(
  filters: GuidedFlowTelemetryListFilters
): Promise<AssistantGuidedFlowEvent[]> {
  if (filters.threadId && filters.clientProfileId) {
    await assertTelemetryScope(
      filters.workspaceId,
      filters.clientProfileId,
      filters.threadId
    );
  }

  return db
    .select()
    .from(assistantGuidedFlowEvents)
    .where(and(...buildTelemetryConditions(filters)))
    .orderBy(desc(assistantGuidedFlowEvents.occurredAt))
    .limit(filters.limit ?? 500);
}
