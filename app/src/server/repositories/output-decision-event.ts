import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db";
import {
  outputDecisionEvents,
  type NewOutputDecisionEvent,
  type OutputDecisionEvent,
} from "../db/schema";

export interface OutputDecisionEventListFilters {
  workspaceId: string;
  campaignId?: string;
  derivationId?: string;
  clientProfileId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Append-only insert for canonical output decision evidence. */
export async function insertOutputDecisionEvent(
  input: NewOutputDecisionEvent
): Promise<OutputDecisionEvent> {
  const [event] = await db.insert(outputDecisionEvents).values(input).returning();
  return event;
}

export async function listOutputDecisionEventsForClient(
  clientProfileId: string,
  workspaceId: string
): Promise<OutputDecisionEvent[]> {
  return db
    .select()
    .from(outputDecisionEvents)
    .where(
      and(
        eq(outputDecisionEvents.workspaceId, workspaceId),
        eq(outputDecisionEvents.clientProfileId, clientProfileId)
      )
    )
    .orderBy(desc(outputDecisionEvents.createdAt));
}

export async function listOutputDecisionEventsForDerivations(
  derivationIds: string[],
  workspaceId: string,
  limit: number = 20
): Promise<OutputDecisionEvent[]> {
  if (derivationIds.length === 0) return [];
  return db
    .select()
    .from(outputDecisionEvents)
    .where(
      and(
        eq(outputDecisionEvents.workspaceId, workspaceId),
        inArray(outputDecisionEvents.derivationId, derivationIds)
      )
    )
    .orderBy(desc(outputDecisionEvents.createdAt))
    .limit(limit * derivationIds.length);
}

export async function listOutputDecisionEvents(
  filters: OutputDecisionEventListFilters
): Promise<OutputDecisionEvent[]> {
  const conditions = [eq(outputDecisionEvents.workspaceId, filters.workspaceId)];

  if (filters.campaignId) {
    conditions.push(eq(outputDecisionEvents.campaignId, filters.campaignId));
  }
  if (filters.derivationId) {
    conditions.push(eq(outputDecisionEvents.derivationId, filters.derivationId));
  }
  if (filters.clientProfileId) {
    conditions.push(eq(outputDecisionEvents.clientProfileId, filters.clientProfileId));
  }
  if (filters.action) {
    conditions.push(eq(outputDecisionEvents.action, filters.action));
  }
  if (filters.from) {
    conditions.push(gte(outputDecisionEvents.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(outputDecisionEvents.createdAt, filters.to));
  }

  return db
    .select()
    .from(outputDecisionEvents)
    .where(and(...conditions))
    .orderBy(desc(outputDecisionEvents.createdAt))
    .limit(filters.limit ?? 100);
}
