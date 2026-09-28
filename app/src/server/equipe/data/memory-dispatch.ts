import type { EquipeIntentRepository, EquipeRepositories } from "./repositories";
import {
  asList,
  buildRow,
  checkFields,
  copy,
  inScope,
  makeMemoryAccountRepo,
  makeMemoryAppendRepo,
  type MemoryEquipeStore,
} from "./memory-core";
import {
  EQUIPE_INTENT_LEASE_TTL_MS,
  EquipeConflictError,
  equipeActorTypeSchema,
  equipeConnectionStatusSchema,
  equipeIntentStatusSchema,
  equipeThreadKindSchema,
  publicationIntentIdempotencyKey,
  type EquipeAccountStatus,
  type EquipeConnection,
  type EquipeEvent,
  type EquipeEventFilter,
  type EquipeIntentFilter,
  type EquipePublicationIntent,
  type NewEquipePublicationIntent,
} from "./types";

// Agregado despacho/histórico em memória: intenções de publicação (insert
// idempotente), conexões, conversas e eventos append-only — mais o claim com
// lease e a varredura de contas do lado interno (jobs).

export type MemoryDispatchRepositories = Pick<
  EquipeRepositories,
  "intents" | "connections" | "threads" | "events"
>;

function filterIntents(
  rows: EquipePublicationIntent[],
  filter: EquipeIntentFilter
): EquipePublicationIntent[] {
  const statuses = asList(filter.status);
  if (statuses !== undefined && statuses.length === 0) return [];
  return rows.filter(
    (row) =>
      (statuses === undefined || (statuses as string[]).includes(row.status)) &&
      (filter.itemId === undefined || row.itemId === filter.itemId)
  );
}

function filterEvents(rows: EquipeEvent[], filter: EquipeEventFilter): EquipeEvent[] {
  return rows.filter(
    (row) =>
      (filter.eventType === undefined || row.eventType === filter.eventType) &&
      (filter.objectType === undefined || row.objectType === filter.objectType) &&
      (filter.objectId === undefined || row.objectId === filter.objectId) &&
      (filter.since === undefined || row.occurredAt >= filter.since)
  );
}

const byOccurredAt = (rows: EquipeEvent[]): EquipeEvent[] =>
  [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

export function makeMemoryDispatchRepositories(
  store: MemoryEquipeStore
): MemoryDispatchRepositories {
  const intentsBase = makeMemoryAccountRepo<
    EquipePublicationIntent,
    NewEquipePublicationIntent & Record<string, unknown>,
    Partial<NewEquipePublicationIntent> & Record<string, unknown>,
    EquipeIntentFilter
  >({
    table: store.intents,
    build: (scope, input) =>
      buildRow(
        scope,
        {
          ...input,
          idempotencyKey: publicationIntentIdempotencyKey(
            input.itemId as string,
            input.versionHash as string
          ),
        },
        {
          status: "pending",
          attempts: 0,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          externalId: null,
          containerId: null,
          lastError: null,
          publishedAt: null,
        },
        "full"
      ),
    uniques: [(row) => `${row.itemId}:${row.versionHash}`],
    validateCreate: checkFields({ status: equipeIntentStatusSchema }),
    validatePatch: checkFields({ status: equipeIntentStatusSchema }),
    filter: filterIntents,
  });
  const intents: EquipeIntentRepository = {
    get: intentsBase.get,
    list: intentsBase.list,
    update: intentsBase.update,
    async getByItemVersion(scope, itemId, versionHash) {
      const found = [...store.intents.rows.values()].find(
        (row) => inScope(row, scope) && row.itemId === itemId && row.versionHash === versionHash
      );
      return found ? copy(found) : null;
    },
    async insertOrGet(scope, input) {
      const existing = await intents.getByItemVersion(scope, input.itemId, input.versionHash);
      if (existing) return { intent: existing, created: false };
      const key = publicationIntentIdempotencyKey(input.itemId, input.versionHash);
      const clash = [...store.intents.rows.values()].find(
        (row) => row.idempotencyKey === key && !inScope(row, scope)
      );
      if (clash) throw new EquipeConflictError("equipe_conflict");
      const intent = await intentsBase.create(scope, input);
      return { intent, created: true };
    },
  };

  return {
    intents,
    connections: makeMemoryAccountRepo({
      table: store.connections,
      build: (scope, input) => {
        const row = buildRow<EquipeConnection>(
          scope,
          input,
          {
            provider: "instagram",
            status: "active",
            custodianPersonId: null,
            lastError: null,
            lastRefreshedAt: null,
          },
          "full"
        );
        return { ...row, connectedAt: (input.connectedAt as Date | undefined) ?? new Date() };
      },
      uniques: [(row) => `${row.accountId}:${row.provider}`],
      validateCreate: checkFields({ status: equipeConnectionStatusSchema }),
      validatePatch: checkFields({ status: equipeConnectionStatusSchema }),
    }),
    threads: makeMemoryAccountRepo({
      table: store.threads,
      build: (scope, input) =>
        buildRow(scope, input, { kind: "primary", topic: null, assistantThreadId: null }, "full"),
      uniques: [(row) => (row.kind === "primary" ? `primary:${row.accountId}` : null)],
      validateCreate: checkFields({ kind: equipeThreadKindSchema }),
      validatePatch: checkFields({ kind: equipeThreadKindSchema }),
    }),
    events: makeMemoryAppendRepo({
      table: store.events,
      build: (scope, input) =>
        buildRow(
          scope,
          input,
          { actorId: null, actorRole: null, objectType: null, objectId: null, payload: null },
          "occurred"
        ),
      validateCreate: checkFields({ actorType: equipeActorTypeSchema }, ["actorType"]),
      filter: filterEvents,
      sort: byOccurredAt,
    }),
  };
}

function isLeaseFree(row: EquipePublicationIntent, now: Date): boolean {
  return row.leaseExpiresAt === null || row.leaseExpiresAt <= now;
}

function isDue(row: EquipePublicationIntent, now: Date): boolean {
  if (row.status === "sending") return row.leaseExpiresAt !== null && row.leaseExpiresAt <= now;
  if (row.status !== "pending") return false;
  if (row.scheduledFor > now) return false;
  if (row.nextAttemptAt !== null && row.nextAttemptAt > now) return false;
  return isLeaseFree(row, now);
}

// Claim global com lease (lado interno, para o job de despacho): pega
// intenções vencidas ainda sem dono ou com lease expirado.
export async function claimMemoryDueIntents(
  store: MemoryEquipeStore,
  input: { owner: string; now: Date; limit?: number; leaseTtlMs?: number }
): Promise<EquipePublicationIntent[]> {
  const limit = input.limit ?? 25;
  const leaseTtlMs = input.leaseTtlMs ?? EQUIPE_INTENT_LEASE_TTL_MS;
  const due = [...store.intents.rows.values()]
    .filter((row) => isDue(row, input.now))
    .sort(
      (a, b) =>
        a.scheduledFor.getTime() - b.scheduledFor.getTime() || a.id.localeCompare(b.id)
    )
    .slice(0, limit);
  const now = new Date();
  for (const row of due) {
    row.status = "sending";
    row.leaseOwner = input.owner;
    row.leaseExpiresAt = new Date(input.now.getTime() + leaseTtlMs);
    row.attempts += 1;
    row.nextAttemptAt = null;
    row.updatedAt = now;
  }
  return due.map(copy);
}

export async function listMemoryAccountsByStatus(
  store: MemoryEquipeStore,
  status: EquipeAccountStatus
) {
  return [...store.accounts.rows.values()].filter((row) => row.status === status).map(copy);
}
