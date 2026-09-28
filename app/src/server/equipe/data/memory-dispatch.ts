import type {
  EquipeDeliveryRepository,
  EquipeIntentRepository,
  EquipeRepositories,
} from "./repositories";
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
  type EquipeNotificationDelivery,
  type EquipePublicationIntent,
  type EquipeRoundStatus,
  type NewEquipeNotificationDelivery,
  type NewEquipePublicationIntent,
} from "./types";

// Agregado despacho/histórico em memória: intenções de publicação (insert
// idempotente), conexões, conversas e eventos append-only — mais o claim com
// lease e a varredura de contas do lado interno (jobs).

export type MemoryDispatchRepositories = Pick<
  EquipeRepositories,
  "intents" | "connections" | "threads" | "events" | "deliveries"
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
    deliveries: makeMemoryDeliveries(store),
  };
}

// Outbox delivery records (#549): idempotent per event, channels unioned.
function makeMemoryDeliveries(store: MemoryEquipeStore): EquipeDeliveryRepository {
  return {
    async record(scope, input: NewEquipeNotificationDelivery) {
      const existing = [...store.deliveries.rows.values()].find(
        (row) => inScope(row, scope) && row.eventId === input.eventId
      );
      if (!existing) {
        const row = buildRow<EquipeNotificationDelivery>(
          scope,
          {
            eventId: input.eventId,
            channels: [...new Set(input.channels)],
            deliveredAt: input.deliveredAt ?? new Date(),
          },
          {},
          "full"
        );
        store.deliveries.rows.set(row.id, row);
        return copy(row);
      }
      const channels = [...new Set([...existing.channels, ...input.channels])];
      const next: EquipeNotificationDelivery = {
        ...existing,
        channels,
        updatedAt: new Date(),
      };
      store.deliveries.rows.set(existing.id, next);
      return copy(next);
    },
    async getByEvent(scope, eventId) {
      const found = [...store.deliveries.rows.values()].find(
        (row) => inScope(row, scope) && row.eventId === eventId
      );
      return found ? copy(found) : null;
    },
    async list(scope) {
      return [...store.deliveries.rows.values()]
        .filter((row) => inScope(row, scope))
        .map(copy);
    },
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

// #583 — todas as contas, qualquer estado (a parada global filtra no módulo).
export async function listMemoryAccounts(store: MemoryEquipeStore) {
  return [...store.accounts.rows.values()].map(copy);
}

// Internal cross-account scan of calibration rounds (#546): the quality
// pipeline groups rounds by state across the staff's accounts.
export async function listMemoryCalibrationRounds(
  store: MemoryEquipeStore,
  filter: { status?: EquipeRoundStatus | EquipeRoundStatus[] } = {}
) {
  const wanted = asList(filter.status);
  return [...store.calibrationRounds.rows.values()]
    .filter((row) => !wanted || wanted.includes(row.status as EquipeRoundStatus))
    .map(copy);
}

// Internal cross-account lookups by id (#554): the detail consoles resolve
// the account scope from the id alone (notification links carry no scope).
export async function getMemoryCalibrationRound(store: MemoryEquipeStore, id: string) {
  const found = store.calibrationRounds.rows.get(id);
  return found ? copy(found) : null;
}

export async function getMemoryEscalation(store: MemoryEquipeStore, id: string) {
  const found = store.escalations.rows.get(id);
  return found ? copy(found) : null;
}

// Internal cross-account scan of fronts (#554): the quality pipeline labels
// each round with its front.
export async function listMemoryFronts(store: MemoryEquipeStore) {
  return [...store.fronts.rows.values()].map(copy);
}

// Internal label join (#554): brand (client profile name) + workspace name
// per account. Missing seeds read as null, like the postgres left joins.
export async function listMemoryAccountLabels(store: MemoryEquipeStore) {
  return [...store.accounts.rows.values()].map((row) => {
    const profile = store.adscaleProfiles.rows.get(row.clientProfileId) ?? null;
    const workspace =
      (profile && store.adscaleWorkspaces.rows.get(profile.workspaceId)) ??
      store.adscaleWorkspaces.rows.get(row.workspaceId) ??
      null;
    return {
      workspaceId: row.workspaceId,
      accountId: row.id,
      brandName: profile && profile.workspaceId === row.workspaceId ? profile.name : null,
      workspaceName: workspace ? workspace.name : null,
    };
  });
}

/** Seed brand/workspace names for tests (never called by commands). */
export function seedMemoryAdscaleLabels(
  store: MemoryEquipeStore,
  input: { workspaceId: string; workspaceName: string; profileId: string; brandName: string },
): void {
  store.adscaleWorkspaces.rows.set(input.workspaceId, {
    id: input.workspaceId,
    name: input.workspaceName,
  });
  store.adscaleProfiles.rows.set(input.profileId, {
    id: input.profileId,
    workspaceId: input.workspaceId,
    name: input.brandName,
  });
}
