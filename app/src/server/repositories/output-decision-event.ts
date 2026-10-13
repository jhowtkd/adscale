import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { equipeAccounts, equipeEvents } from "../db/equipe-schema";
import {
  outputDecisionEvents,
  type NewOutputDecisionEvent,
  type OutputDecisionEvent,
} from "../db/schema";

// Preserve the original decision; factual reclassification removes its exact request/Versão from taste support.
const notFactuallyClassifiedAdjustment = sql`not exists (
  select 1 from ${equipeEvents} classification
  join ${equipeAccounts} account on account.id = classification.account_id and account.workspace_id = classification.workspace_id
  where classification.workspace_id = ${outputDecisionEvents.workspaceId}
    and account.client_profile_id = ${outputDecisionEvents.clientProfileId}
    and classification.event_type = 'round.rejection_classified' and classification.object_type = 'round'
    and classification.actor_type = 'staff' and classification.actor_role = 'quality' and btrim(classification.actor_id) <> ''
    and classification.payload->>'to' = 'fact'
    and classification.payload->>'adjustmentSourceEventId' = ${outputDecisionEvents.equipeEventId}::text
    and classification.payload->>'versionHash' = ${outputDecisionEvents.contextSnapshot}->>'itemVersionHash'
    and jsonb_typeof(classification.payload->'classificationSequence') = 'number'
    and classification.payload->'classificationSequence' > '0'::jsonb
    and not exists (
      select 1 from ${equipeEvents} newer
      where newer.workspace_id = classification.workspace_id and newer.account_id = classification.account_id
        and newer.event_type = classification.event_type and newer.object_type = 'round'
        and newer.actor_type = 'staff' and newer.actor_role = 'quality' and btrim(newer.actor_id) <> ''
        and newer.payload->>'to' in ('fact', 'brand', 'taste')
        and newer.payload->>'adjustmentSourceEventId' = classification.payload->>'adjustmentSourceEventId'
        and newer.payload->>'versionHash' = classification.payload->>'versionHash'
        and jsonb_typeof(newer.payload->'classificationSequence') = 'number'
        and newer.payload->'classificationSequence' > classification.payload->'classificationSequence'
    )
)`;

export interface OutputDecisionEventListFilters {
  workspaceId: string;
  campaignId?: string;
  derivationId?: string;
  creativeWorkOutputId?: string;
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
  const insert = db.insert(outputDecisionEvents).values(input);
  const [event] = input.idempotencyKey
    ? await insert.onConflictDoNothing({
        target: [outputDecisionEvents.workspaceId, outputDecisionEvents.idempotencyKey],
        where: sql`${outputDecisionEvents.idempotencyKey} is not null`,
      }).returning()
    : await insert.returning();
  if (event) return event;

  const [existing] = await db.select().from(outputDecisionEvents).where(and(
    eq(outputDecisionEvents.workspaceId, input.workspaceId),
    eq(outputDecisionEvents.idempotencyKey, input.idempotencyKey!),
  )).limit(1);
  if (!existing) throw new Error("Output decision event was not persisted");
  return existing;
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
        eq(outputDecisionEvents.clientProfileId, clientProfileId),
        sql`${outputDecisionEvents.authorType} in ('human', 'equipe_actor')`,
        notFactuallyClassifiedAdjustment
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
        inArray(outputDecisionEvents.derivationId, derivationIds),
        sql`${outputDecisionEvents.authorType} in ('human', 'equipe_actor')`,
        notFactuallyClassifiedAdjustment
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
  if (filters.creativeWorkOutputId) {
    conditions.push(eq(outputDecisionEvents.creativeWorkOutputId, filters.creativeWorkOutputId));
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
