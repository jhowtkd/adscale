import { eq, and, desc, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  betaAnalyticsEvents,
  betaSessions,
  type BetaAnalyticsEvent,
  type BetaSession,
  type NewBetaAnalyticsEvent,
} from "../db/schema";

export interface BetaAnalyticsListFilters {
  workspaceId: string;
  sessionId?: string;
  eventKey?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Owner dashboard filters — workspaceId optional for cross-workspace rollups. */
export interface OwnerAnalyticsListFilters {
  workspaceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function insertBetaAnalyticsEvent(
  input: NewBetaAnalyticsEvent
): Promise<BetaAnalyticsEvent> {
  const [event] = await db
    .insert(betaAnalyticsEvents)
    .values(input)
    .returning();

  return event;
}

function buildAnalyticsConditions(
  filters: BetaAnalyticsListFilters | OwnerAnalyticsListFilters
) {
  const conditions = [];

  if ("workspaceId" in filters && filters.workspaceId) {
    conditions.push(eq(betaAnalyticsEvents.workspaceId, filters.workspaceId));
  }
  if (filters.sessionId) {
    conditions.push(eq(betaAnalyticsEvents.sessionId, filters.sessionId));
  }
  if ("eventKey" in filters && filters.eventKey) {
    conditions.push(eq(betaAnalyticsEvents.eventKey, filters.eventKey));
  }
  if (filters.from) {
    conditions.push(gte(betaAnalyticsEvents.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(betaAnalyticsEvents.createdAt, filters.to));
  }

  return conditions;
}

export async function listBetaAnalyticsEvents(
  filters: BetaAnalyticsListFilters
): Promise<BetaAnalyticsEvent[]> {
  const conditions = buildAnalyticsConditions(filters);

  return db
    .select()
    .from(betaAnalyticsEvents)
    .where(and(...conditions))
    .orderBy(desc(betaAnalyticsEvents.createdAt))
    .limit(filters.limit ?? 100);
}

export async function listBetaAnalyticsEventsForOwner(
  filters: OwnerAnalyticsListFilters = {}
): Promise<BetaAnalyticsEvent[]> {
  const conditions = buildAnalyticsConditions(filters);
  const query = db.select().from(betaAnalyticsEvents).orderBy(desc(betaAnalyticsEvents.createdAt));

  if (conditions.length === 0) {
    return query.limit(filters.limit ?? 5000);
  }

  return query
    .where(and(...conditions))
    .limit(filters.limit ?? 5000);
}

export async function getBetaSessionById(
  workspaceId: string,
  sessionId: string
): Promise<BetaSession | null> {
  const [session] = await db
    .select()
    .from(betaSessions)
    .where(
      and(
        eq(betaSessions.id, sessionId),
        eq(betaSessions.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return session ?? null;
}
