import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  assistantArtifactIterationEvents,
  type AssistantArtifactIterationEvent,
  type NewAssistantArtifactIterationEvent,
} from "../db/schema";
import { getAssistantThreadById } from "./assistant-thread";

export class ArtifactIterationTelemetryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactIterationTelemetryValidationError";
  }
}

export interface ArtifactIterationTelemetryListFilters {
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
    throw new ArtifactIterationTelemetryValidationError("Thread not found");
  }
  if (thread.clientProfileId !== clientProfileId) {
    throw new ArtifactIterationTelemetryValidationError(
      "Client profile does not match thread scope"
    );
  }
  return thread;
}

export async function insertArtifactIterationTelemetryEvent(
  input: NewAssistantArtifactIterationEvent
): Promise<AssistantArtifactIterationEvent> {
  await assertTelemetryScope(
    input.workspaceId,
    input.clientProfileId,
    input.threadId
  );

  const [event] = await db
    .insert(assistantArtifactIterationEvents)
    .values(input)
    .returning();

  return event;
}

function buildTelemetryConditions(filters: ArtifactIterationTelemetryListFilters) {
  const conditions = [
    eq(assistantArtifactIterationEvents.workspaceId, filters.workspaceId),
  ];

  if (filters.clientProfileId) {
    conditions.push(
      eq(assistantArtifactIterationEvents.clientProfileId, filters.clientProfileId)
    );
  }
  if (filters.threadId) {
    conditions.push(eq(assistantArtifactIterationEvents.threadId, filters.threadId));
  }
  if (filters.path) {
    conditions.push(eq(assistantArtifactIterationEvents.path, filters.path));
  }
  if (filters.step) {
    conditions.push(eq(assistantArtifactIterationEvents.step, filters.step));
  }
  if (filters.eventKey) {
    conditions.push(eq(assistantArtifactIterationEvents.eventKey, filters.eventKey));
  }
  if (filters.from) {
    conditions.push(gte(assistantArtifactIterationEvents.occurredAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(assistantArtifactIterationEvents.occurredAt, filters.to));
  }

  return conditions;
}

export async function listArtifactIterationTelemetryEvents(
  filters: ArtifactIterationTelemetryListFilters
): Promise<AssistantArtifactIterationEvent[]> {
  if (filters.threadId && filters.clientProfileId) {
    await assertTelemetryScope(
      filters.workspaceId,
      filters.clientProfileId,
      filters.threadId
    );
  }

  return db
    .select()
    .from(assistantArtifactIterationEvents)
    .where(and(...buildTelemetryConditions(filters)))
    .orderBy(desc(assistantArtifactIterationEvents.occurredAt))
    .limit(filters.limit ?? 500);
}

export interface OwnerArtifactIterationTelemetryListFilters {
  workspaceId?: string;
  clientProfileId?: string;
  threadId?: string;
  path?: string;
  step?: string;
  eventKey?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

function buildOwnerTelemetryConditions(
  filters: OwnerArtifactIterationTelemetryListFilters
) {
  const conditions = [];

  if (filters.workspaceId) {
    conditions.push(
      eq(assistantArtifactIterationEvents.workspaceId, filters.workspaceId)
    );
  }
  if (filters.clientProfileId) {
    conditions.push(
      eq(assistantArtifactIterationEvents.clientProfileId, filters.clientProfileId)
    );
  }
  if (filters.threadId) {
    conditions.push(eq(assistantArtifactIterationEvents.threadId, filters.threadId));
  }
  if (filters.path) {
    conditions.push(eq(assistantArtifactIterationEvents.path, filters.path));
  }
  if (filters.step) {
    conditions.push(eq(assistantArtifactIterationEvents.step, filters.step));
  }
  if (filters.eventKey) {
    conditions.push(eq(assistantArtifactIterationEvents.eventKey, filters.eventKey));
  }
  if (filters.from) {
    conditions.push(gte(assistantArtifactIterationEvents.occurredAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(assistantArtifactIterationEvents.occurredAt, filters.to));
  }

  return conditions;
}

export async function listArtifactIterationTelemetryEventsForOwner(
  filters: OwnerArtifactIterationTelemetryListFilters = {}
): Promise<AssistantArtifactIterationEvent[]> {
  const conditions = buildOwnerTelemetryConditions(filters);
  const query = db
    .select()
    .from(assistantArtifactIterationEvents)
    .orderBy(desc(assistantArtifactIterationEvents.occurredAt));

  if (conditions.length === 0) {
    return query.limit(filters.limit ?? 5000);
  }

  return query
    .where(and(...conditions))
    .limit(filters.limit ?? 5000);
}
