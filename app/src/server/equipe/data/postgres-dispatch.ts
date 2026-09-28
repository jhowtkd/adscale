import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  equipeAccounts,
  equipeConnections,
  equipeEvents,
  equipePublicationIntents,
  equipeThreads,
} from "../../db/equipe-schema";
import type {
  EquipeConnectionRepository,
  EquipeEventRepository,
  EquipeIntentRepository,
  EquipeThreadRepository,
} from "./repositories";
import {
  makePgAccountRepo,
  makePgAppendRepo,
  mapPgError,
  pgGet,
  pgList,
  pgUpdate,
  stripUndefinedRecord,
  type PostgresEquipeExecutor,
} from "./postgres";
import {
  EQUIPE_INTENT_LEASE_TTL_MS,
  EquipeNotFoundError,
  publicationIntentIdempotencyKey,
  type AccountScope,
  type EquipeAccount,
  type EquipeAccountStatus,
  type EquipeConnectionPatch,
  type EquipeEventFilter,
  type EquipeIntentFilter,
  type EquipePublicationIntent,
  type EquipePublicationIntentPatch,
  type EquipeThreadPatch,
  type NewEquipeConnection,
  type NewEquipeEvent,
  type NewEquipePublicationIntent,
  type NewEquipeThread,
} from "./types";

// Repositórios Postgres de despacho e histórico: intenções de publicação
// (insert idempotente + claim com lease), conexões, conversas e eventos.

export function makePgIntents(executor: PostgresEquipeExecutor): EquipeIntentRepository {
  return {
    async insertOrGet(
      scope: AccountScope,
      input: NewEquipePublicationIntent
    ): Promise<{ intent: EquipePublicationIntent; created: boolean }> {
      const idempotencyKey = publicationIntentIdempotencyKey(input.itemId, input.versionHash);
      try {
        const [created] = await executor
          .insert(equipePublicationIntents)
          .values({ ...stripUndefinedRecord(input), ...scope, idempotencyKey })
          .onConflictDoNothing({
            target: [
              equipePublicationIntents.itemId,
              equipePublicationIntents.versionHash,
            ],
          })
          .returning();
        if (created) return { intent: created, created: true };
      } catch (error) {
        throw mapPgError(error);
      }
      const existing = await pgList(executor, equipePublicationIntents, scope, and(
        eq(equipePublicationIntents.itemId, input.itemId),
        eq(equipePublicationIntents.versionHash, input.versionHash)
      ));
      if (!existing[0]) throw new EquipeNotFoundError("equipe_intent_conflict_without_row");
      return { intent: existing[0], created: false };
    },
    get: (scope, id) => pgGet(executor, equipePublicationIntents, scope, id),
    async getByItemVersion(
      scope: AccountScope,
      itemId: string,
      versionHash: string
    ): Promise<EquipePublicationIntent | null> {
      const rows = await pgList(executor, equipePublicationIntents, scope, and(
        eq(equipePublicationIntents.itemId, itemId),
        eq(equipePublicationIntents.versionHash, versionHash)
      ));
      return rows[0] ?? null;
    },
    async list(
      scope: AccountScope,
      filter?: EquipeIntentFilter
    ): Promise<EquipePublicationIntent[]> {
      const conditions = [];
      if (filter?.status !== undefined) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        if (statuses.length === 0) return [];
        conditions.push(
          statuses.length === 1
            ? eq(equipePublicationIntents.status, statuses[0] as string)
            : inArray(equipePublicationIntents.status, statuses as string[])
        );
      }
      if (filter?.itemId !== undefined) {
        conditions.push(eq(equipePublicationIntents.itemId, filter.itemId));
      }
      return pgList(
        executor,
        equipePublicationIntents,
        scope,
        conditions.length > 0 ? and(...conditions) : undefined
      );
    },
    update: (scope, id, patch: EquipePublicationIntentPatch) =>
      pgUpdate(executor, equipePublicationIntents, scope, id, patch),
  };
}

export function makePgConnections(
  executor: PostgresEquipeExecutor
): EquipeConnectionRepository {
  return makePgAccountRepo<typeof equipeConnections, NewEquipeConnection, EquipeConnectionPatch>(
    executor,
    { table: equipeConnections }
  );
}

export function makePgThreads(executor: PostgresEquipeExecutor): EquipeThreadRepository {
  return makePgAccountRepo<typeof equipeThreads, NewEquipeThread, EquipeThreadPatch>(
    executor,
    { table: equipeThreads }
  );
}

export function makePgEvents(executor: PostgresEquipeExecutor): EquipeEventRepository {
  return makePgAppendRepo<typeof equipeEvents, NewEquipeEvent, EquipeEventFilter>(executor, {
    table: equipeEvents,
    buildFilter: (table, filter) => {
      const conditions = [];
      if (filter.eventType !== undefined) {
        conditions.push(eq(table.eventType, filter.eventType));
      }
      if (filter.objectType !== undefined) {
        conditions.push(eq(table.objectType, filter.objectType));
      }
      if (filter.objectId !== undefined) conditions.push(eq(table.objectId, filter.objectId));
      if (filter.since !== undefined) conditions.push(gte(table.occurredAt, filter.since));
      if (conditions.length === 0) return undefined;
      return and(...conditions);
    },
    orderBy: (table) => table.occurredAt,
  });
}

type IntentRow = Record<string, unknown>;

function asDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value as string);
}

function mapIntentRow(row: IntentRow): EquipePublicationIntent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    accountId: row.account_id as string,
    itemId: row.item_id as string,
    versionHash: row.version_hash as string,
    idempotencyKey: row.idempotency_key as string,
    status: row.status as EquipePublicationIntent["status"],
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: asDate(row.lease_expires_at),
    attempts: row.attempts as number,
    nextAttemptAt: asDate(row.next_attempt_at),
    externalId: (row.external_id as string | null) ?? null,
    containerId: (row.container_id as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    scheduledFor: asDate(row.scheduled_for) as Date,
    publishedAt: asDate(row.published_at),
    createdAt: asDate(row.created_at) as Date,
    updatedAt: asDate(row.updated_at) as Date,
  };
}

function toUtcWallClock(value: Date): string {
  return value.toISOString().slice(0, 23).replace("T", " ");
}

// Claim global com lease (lado interno, para o job de despacho): pega intenções
// vencidas ainda sem dono ou com lease expirado — mesmo padrão de
// lease_owner/lease_expires_at do outbox de efeitos de seleção (0110), com
// FOR UPDATE SKIP LOCKED para despachantes concorrentes não colidirem.
export async function claimDueIntents(
  executor: PostgresEquipeExecutor,
  input: { owner: string; now: Date; limit?: number; leaseTtlMs?: number }
): Promise<EquipePublicationIntent[]> {
  const limit = input.limit ?? 25;
  const leaseTtlMs = input.leaseTtlMs ?? EQUIPE_INTENT_LEASE_TTL_MS;
  // Expiração calculada em JS: Date em expressão aritmética não tem tipo
  // inferível (42804). E as amarras vão como parede UTC em texto: Date ligado
  // no SQL cru compara como parede LOCAL (quebra fora de UTC), enquanto o
  // builder grava timestamp como parede UTC — o texto UTC casa com ele.
  // Invariante: toda coluna de tempo da Equipe é timestamp sem tz gravada
  // como parede UTC pelo drizzle (mode: "date", verificado em 0116/schema).
  const nowWall = toUtcWallClock(input.now);
  const expiresAtWall = toUtcWallClock(new Date(input.now.getTime() + leaseTtlMs));
  const result = await executor.execute(sql`
    WITH claimed AS (
      SELECT intent.id
      FROM adscale_equipe.equipe_publication_intents AS intent
      WHERE (intent.status = 'pending'
        AND intent.scheduled_for <= ${nowWall}
        AND (intent.next_attempt_at IS NULL OR intent.next_attempt_at <= ${nowWall})
        AND (intent.lease_expires_at IS NULL OR intent.lease_expires_at <= ${nowWall}))
         OR (intent.status = 'sending' AND intent.lease_expires_at <= ${nowWall})
      ORDER BY intent.scheduled_for ASC, intent.id ASC
      LIMIT ${limit}
      FOR UPDATE OF intent SKIP LOCKED
    )
    UPDATE adscale_equipe.equipe_publication_intents AS intent
    SET status = 'sending',
        lease_owner = ${input.owner},
        lease_expires_at = ${expiresAtWall},
        attempts = intent.attempts + 1,
        next_attempt_at = NULL,
        updated_at = now()
    FROM claimed
    WHERE intent.id = claimed.id
    RETURNING intent.id AS id,
      intent.workspace_id AS workspace_id,
      intent.account_id AS account_id,
      intent.item_id AS item_id,
      intent.version_hash AS version_hash,
      intent.idempotency_key AS idempotency_key,
      intent.status AS status,
      intent.lease_owner AS lease_owner,
      intent.lease_expires_at AS lease_expires_at,
      intent.attempts AS attempts,
      intent.next_attempt_at AS next_attempt_at,
      intent.external_id AS external_id,
      intent.container_id AS container_id,
      intent.last_error AS last_error,
      intent.scheduled_for AS scheduled_for,
      intent.published_at AS published_at,
      intent.created_at AS created_at,
      intent.updated_at AS updated_at
  `);
  return (result.rows as IntentRow[]).map(mapIntentRow);
}

// Varredura entre contas (lado interno): contas por estado, para jobs/monitores.
export async function listAccountsByStatus(
  executor: PostgresEquipeExecutor,
  status: EquipeAccountStatus
): Promise<EquipeAccount[]> {
  return executor
    .select()
    .from(equipeAccounts)
    .where(eq(equipeAccounts.status, status));
}
