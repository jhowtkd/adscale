import { and, asc, eq, getTableColumns, gt, isNull, sql, notInArray, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { db as appDb } from "../../db/index";
import {
  equipeAccountPeople,
  equipeAccounts,
  equipeEvents,
  equipeNotificationDeliveries,
  equipeBrandHandoffs,
  equipeBrandDocuments,
  equipeTaskOutbox,
  equipeFronts,
  equipeIdeas,
  equipeMandates,
  equipeOnboardingSteps,
  equipePlans,
  equipeContextVersions,
  equipeStaff,
} from "../../db/equipe-schema";
import type {
  AccountScopedRepository,
  AppendOnlyRepository,
  EquipeAccountRepository,
  EquipeRepositories,
  EquipeStaffRepository,
  EquipeUnitOfWork,
  InternalEquipeRepositories,
} from "./repositories";
import {
  EquipeConflictError,
  EquipeNotFoundError,
  type AccountScope,
  type EquipeAccount,
  type EquipeAccountPatch,
  type EquipeAccountPersonPatch,
  type EquipeContextVersionPatch,
  type EquipeFrontPatch,
  type EquipeIdeaPatch,
  type EquipeMandatePatch,
  type EquipeOnboardingStepPatch,
  type EquipePlanPatch,
  type EquipeStaffFilter,
  type EquipeStaffMember,
  type EquipeStaffPatch,
  type NewEquipeAccount,
  type NewEquipeAccountPerson,
  type NewEquipeContextVersion,
  type NewEquipeFront,
  type NewEquipeIdea,
  type NewEquipeMandate,
  type NewEquipeOnboardingStep,
  type NewEquipePlan,
  type NewEquipeStaffMember,
} from "./types";
import {
  makePgBatches,
  makePgCalibrationRounds,
  makePgCalibrationScores,
  makePgEscalations,
  makePgExceptions,
  makePgItems,
  makePgItemVersions,
  makePgPauses,
  makePgReceipts,
} from "./postgres-production";
import {
  claimDueIntents,
  getCalibrationRound,
  getEscalation,
  listAccountLabels,
  listAccounts,
  listAccountsByStatus,
  listCalibrationRounds,
  listFronts,
  makePgConnections,
  makePgDeliveries,
  makePgEvents,
  makePgGlobalStops,
  makePgIntents,
  makePgThreads,
} from "./postgres-dispatch";

import { clientProfiles, user, workspaceMembers, workspaces, workspaceAssets } from "../../db/schema";
import { canAdoptHandoffAsset, handoffLibraryItems, handoffAssetMetadata, handoffAssetSource } from "../handoff/library";
import { makePgConversations } from "./conversations";

// Implementação Postgres dos repositórios da Equipe. Recebe o executor
// (db ou transação) por parâmetro — nunca importa o db global, para os
// testes unitários poderem importar este módulo sem DATABASE_URL.
export type PostgresEquipeDatabase = typeof appDb;
export type PostgresEquipeTransaction = Parameters<
  Parameters<PostgresEquipeDatabase["transaction"]>[0]
>[0];
export type PostgresEquipeExecutor = Pick<
  PostgresEquipeDatabase,
  "insert" | "select" | "selectDistinct" | "update" | "delete" | "execute"
>;

export type ScopedPgTable = PgTable & {
  id: AnyPgColumn;
  workspaceId: AnyPgColumn;
  accountId: AnyPgColumn;
};

export type MutablePgTable = ScopedPgTable & { updatedAt: AnyPgColumn };

export function isUniqueViolation(error: unknown): boolean {
  // O drizzle embrulha o erro do driver ("Failed query: ..."): o code 23505
  // vive no cause, não no wrapper.
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function mapPgError(error: unknown): Error {
  if (error instanceof EquipeNotFoundError || error instanceof EquipeConflictError) return error;
  if (isUniqueViolation(error)) return new EquipeConflictError("equipe_conflict");
  return error instanceof Error ? error : new Error("equipe_unknown_error");
}

export function stripUndefinedRecord<T extends Record<string, unknown>>(patch: T): T {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean as T;
}

function scopeConditions(table: ScopedPgTable, scope: AccountScope) {
  return [
    eq(table.workspaceId, scope.workspaceId),
    eq(table.accountId, scope.accountId),
  ];
}

export async function pgCreate<T extends ScopedPgTable>(
  executor: PostgresEquipeExecutor,
  table: T,
  scope: AccountScope,
  values: T["$inferInsert"]
): Promise<T["$inferSelect"]> {
  try {
    // Os builders do drizzle não resolvem condicionais sobre T genérico;
    // o cast fica contido nestes helpers e o retorno segue tipado por T.
    // Campos undefined caem para o DEFAULT do banco (como na memória).
    const rows = (await executor
      .insert(table as PgTable)
      .values({ ...stripUndefinedRecord(values as Record<string, unknown>), ...scope })
      .returning()) as T["$inferSelect"][];
    const row = rows[0];
    if (!row) throw new Error("equipe_insert_without_row");
    return row;
  } catch (error) {
    throw mapPgError(error);
  }
}

export async function pgGet<T extends ScopedPgTable>(
  executor: PostgresEquipeExecutor,
  table: T,
  scope: AccountScope,
  id: string,
  options?: { forUpdate: boolean },
): Promise<T["$inferSelect"] | null> {
  const query = executor.select().from(table as PgTable)
    .where(and(...scopeConditions(table, scope), eq(table.id, id))).limit(1);
  const rows = (await (options?.forUpdate ? query.for("update") : query)) as T["$inferSelect"][];
  return rows[0] ?? null;
}

export async function pgList<T extends ScopedPgTable>(
  executor: PostgresEquipeExecutor,
  table: T,
  scope: AccountScope,
  extra?: SQL | undefined
): Promise<T["$inferSelect"][]> {
  const conditions = [...scopeConditions(table, scope)];
  if (extra) conditions.push(extra);
  return (await executor
    .select()
    .from(table as PgTable)
    .where(and(...conditions))) as T["$inferSelect"][];
}

export async function pgListOrdered<T extends ScopedPgTable>(
  executor: PostgresEquipeExecutor,
  table: T,
  scope: AccountScope,
  orderBy: SQL | AnyPgColumn,
  extra?: SQL | undefined
): Promise<T["$inferSelect"][]> {
  const conditions = [...scopeConditions(table, scope)];
  if (extra) conditions.push(extra);
  return (await executor
    .select()
    .from(table as PgTable)
    .where(and(...conditions))
    .orderBy(orderBy)) as T["$inferSelect"][];
}

export async function pgUpdate<T extends MutablePgTable>(
  executor: PostgresEquipeExecutor,
  table: T,
  scope: AccountScope,
  id: string,
  patch: Partial<T["$inferInsert"]>
): Promise<T["$inferSelect"]> {
  try {
    const rows = (await executor
      .update(table as PgTable)
      .set({ ...stripUndefinedRecord(patch as Record<string, unknown>), updatedAt: new Date() })
      .where(and(...scopeConditions(table, scope), eq(table.id, id)))
      .returning()) as T["$inferSelect"][];
    const row = rows[0];
    if (!row) throw new EquipeNotFoundError("equipe_not_found");
    return row;
  } catch (error) {
    throw mapPgError(error);
  }
}

// Constrói um repositório com escopo de conta sobre create/get/list/update.
export function makePgAccountRepo<T extends MutablePgTable, C, P, F = undefined>(
  executor: PostgresEquipeExecutor,
  opts: {
    table: T;
    buildFilter?: (table: T, filter: F) => SQL | undefined;
  }
): AccountScopedRepository<T["$inferSelect"], C, P, F> {
  return {
    create: (scope, input) =>
      pgCreate(executor, opts.table, scope, input as T["$inferInsert"]),
    get: (scope, id, options) => pgGet(executor, opts.table, scope, id, options),
    list: (scope, filter) =>
      pgList(
        executor,
        opts.table,
        scope,
        filter === undefined ? undefined : opts.buildFilter?.(opts.table, filter)
      ),
    update: (scope, id, patch) =>
      pgUpdate(executor, opts.table, scope, id, patch as Partial<T["$inferInsert"]>),
  };
}

// Constrói um repositório append-only (create/get/list; sem update/delete).
export function makePgAppendRepo<T extends ScopedPgTable, C, F = undefined>(
  executor: PostgresEquipeExecutor,
  opts: {
    table: T;
    buildFilter?: (table: T, filter: F) => SQL | undefined;
    orderBy?: (table: T) => SQL | AnyPgColumn;
  }
): AppendOnlyRepository<T["$inferSelect"], C, F> {
  return {
    create: (scope, input) =>
      pgCreate(executor, opts.table, scope, input as T["$inferInsert"]),
    get: (scope, id, options) => pgGet(executor, opts.table, scope, id, options),
    list: (scope, filter) => {
      const extra =
        filter === undefined ? undefined : opts.buildFilter?.(opts.table, filter);
      return opts.orderBy
        ? pgListOrdered(executor, opts.table, scope, opts.orderBy(opts.table), extra)
        : pgList(executor, opts.table, scope, extra);
    },
  };
}

function makePgAccounts(executor: PostgresEquipeExecutor): EquipeAccountRepository {
  return {
    async create(workspaceId: string, input: NewEquipeAccount): Promise<EquipeAccount> {
      try {
        const [row] = await executor
          .insert(equipeAccounts)
          .values({ ...stripUndefinedRecord(input), workspaceId })
          .returning();
        if (!row) throw new Error("equipe_insert_without_row");
        return row;
      } catch (error) {
        throw mapPgError(error);
      }
    },
    async get(workspaceId: string, accountId: string, options?: { forUpdate: boolean }): Promise<EquipeAccount | null> {
      const query = executor
        .select()
        .from(equipeAccounts)
        .where(
          and(
            eq(equipeAccounts.workspaceId, workspaceId),
            eq(equipeAccounts.id, accountId)
          )
        )
        .limit(1);
      // NO KEY UPDATE: still exclusive between account lockers, but does not block the
      // FOR KEY SHARE that every child insert (events, versions, intents) takes through
      // its account FK. FOR UPDATE here deadlocks against item-lock-then-insert commands.
      const rows = await (options?.forUpdate ? query.for("no key update") : query);
      return rows[0] ?? null;
    },
    async findByClientProfile(
      workspaceId: string,
      clientProfileId: string
    ): Promise<EquipeAccount | null> {
      const rows = await executor
        .select()
        .from(equipeAccounts)
        .where(
          and(
            eq(equipeAccounts.workspaceId, workspaceId),
            eq(equipeAccounts.clientProfileId, clientProfileId)
          )
        )
        .limit(1);
      return rows[0] ?? null;
    },
    async list(workspaceId: string): Promise<EquipeAccount[]> {
      return executor
        .select()
        .from(equipeAccounts)
        .where(eq(equipeAccounts.workspaceId, workspaceId));
    },
    async update(
      workspaceId: string,
      accountId: string,
      patch: EquipeAccountPatch
    ): Promise<EquipeAccount> {
      try {
        const [row] = await executor
          .update(equipeAccounts)
          .set({ ...stripUndefinedRecord(patch), updatedAt: new Date() })
          .where(
            and(
              eq(equipeAccounts.workspaceId, workspaceId),
              eq(equipeAccounts.id, accountId)
            )
          )
          .returning();
        if (!row) throw new EquipeNotFoundError("equipe_not_found");
        return row;
      } catch (error) {
        throw mapPgError(error);
      }
    },
  };
}

function makePgStaff(executor: PostgresEquipeExecutor): EquipeStaffRepository {
  return {
    async create(input: NewEquipeStaffMember): Promise<EquipeStaffMember> {
      try {
        const [row] = await executor
          .insert(equipeStaff)
          .values(stripUndefinedRecord(input))
          .returning();
        if (!row) throw new Error("equipe_insert_without_row");
        return row;
      } catch (error) {
        throw mapPgError(error);
      }
    },
    async get(id: string): Promise<EquipeStaffMember | null> {
      const rows = await executor
        .select()
        .from(equipeStaff)
        .where(eq(equipeStaff.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async list(filter?: EquipeStaffFilter): Promise<EquipeStaffMember[]> {
      const conditions = [];
      if (filter?.role !== undefined) conditions.push(eq(equipeStaff.role, filter.role));
      if (filter?.active !== undefined) conditions.push(eq(equipeStaff.active, filter.active));
      if (conditions.length === 0) return executor.select().from(equipeStaff);
      return executor
        .select()
        .from(equipeStaff)
        .where(and(...conditions));
    },
    async update(id: string, patch: EquipeStaffPatch): Promise<EquipeStaffMember> {
      try {
        const [row] = await executor
          .update(equipeStaff)
          .set({ ...stripUndefinedRecord(patch), updatedAt: new Date() })
          .where(eq(equipeStaff.id, id))
          .returning();
        if (!row) throw new EquipeNotFoundError("equipe_not_found");
        return row;
      } catch (error) {
        throw mapPgError(error);
      }
    },
  };
}

export function createPostgresEquipeRepositories(
  executor: PostgresEquipeExecutor
): EquipeRepositories {
  return {
    documents: {
      ...makePgAppendRepo<typeof equipeBrandDocuments, import("./types").NewEquipeBrandDocument>(executor, { table: equipeBrandDocuments }),
      async create(scope, input) {
        const [account] = await executor.select({ profileId: equipeAccounts.clientProfileId }).from(equipeAccounts)
          .where(and(eq(equipeAccounts.id, scope.accountId), eq(equipeAccounts.workspaceId, scope.workspaceId))).limit(1);
        if (account?.profileId !== input.clientProfileId) throw new EquipeNotFoundError("document_brand_not_found");
        return pgCreate(executor, equipeBrandDocuments, scope, { ...input, ...scope });
      },
    },
    taskOutbox: {
      ...makePgAppendRepo<typeof equipeTaskOutbox, import("./types").NewEquipeTaskIntent>(executor, { table: equipeTaskOutbox }),
      async markDispatched(scope, id, at) {
        await executor.update(equipeTaskOutbox).set({ dispatchedAt: at }).where(and(
          eq(equipeTaskOutbox.workspaceId, scope.workspaceId), eq(equipeTaskOutbox.accountId, scope.accountId), eq(equipeTaskOutbox.id, id),
        ));
      },
    },
    handoffs: {
      ...makePgAppendRepo<typeof equipeBrandHandoffs, import("./types").NewEquipeBrandHandoff>(executor, { table: equipeBrandHandoffs }),
      update: (scope, id, patch) => pgUpdate(executor, equipeBrandHandoffs, scope, id, patch),
    },
    conversations: makePgConversations(executor),
    accounts: makePgAccounts(executor),
    people: makePgAccountRepo<typeof equipeAccountPeople, NewEquipeAccountPerson, EquipeAccountPersonPatch>(
      executor,
      { table: equipeAccountPeople }
    ),
    fronts: makePgAccountRepo<typeof equipeFronts, NewEquipeFront, EquipeFrontPatch>(executor, {
      table: equipeFronts,
    }),
    onboarding: makePgAccountRepo<
      typeof equipeOnboardingSteps,
      NewEquipeOnboardingStep,
      EquipeOnboardingStepPatch
    >(executor, { table: equipeOnboardingSteps }),
    contexts: makePgAccountRepo<
      typeof equipeContextVersions,
      NewEquipeContextVersion,
      EquipeContextVersionPatch
    >(executor, { table: equipeContextVersions }),
    plans: makePgAccountRepo<typeof equipePlans, NewEquipePlan, EquipePlanPatch>(executor, {
      table: equipePlans,
    }),
    mandates: makePgAccountRepo<typeof equipeMandates, NewEquipeMandate, EquipeMandatePatch>(
      executor,
      { table: equipeMandates }
    ),
    ideas: makePgAccountRepo<typeof equipeIdeas, NewEquipeIdea, EquipeIdeaPatch>(executor, {
      table: equipeIdeas,
    }),
    batches: makePgBatches(executor),
    items: makePgItems(executor),
    itemVersions: makePgItemVersions(executor),
    receipts: makePgReceipts(executor),
    calibrationRounds: makePgCalibrationRounds(executor),
    calibrationScores: makePgCalibrationScores(executor),
    escalations: makePgEscalations(executor),
    exceptions: makePgExceptions(executor),
    pauses: makePgPauses(executor),
    intents: makePgIntents(executor),
    connections: makePgConnections(executor),
    threads: makePgThreads(executor),
    events: makePgEvents(executor),
    deliveries: makePgDeliveries(executor),
  };
}

export function createPostgresInternalEquipeRepositories(
  executor: PostgresEquipeExecutor
): InternalEquipeRepositories {
  return {
    async listWorkspaceIds(options) {
      const query = executor.select({ id: workspaces.id }).from(workspaces)
        .where(options?.after ? gt(workspaces.id, options.after) : undefined).orderBy(asc(workspaces.id));
      return (await (options?.limit === undefined ? query : query.limit(options.limit))).map((row) => row.id);
    },
    async listPendingTaskIntents() {
      return executor.select().from(equipeTaskOutbox).where(isNull(equipeTaskOutbox.dispatchedAt))
        .orderBy(asc(equipeTaskOutbox.createdAt));
    },
    async lockWorkspace(workspaceId) {
      await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`equipe-free:${workspaceId}`}, 0))`);
    },
    async getVerifiedWorkspaceMember(workspaceId, userId) {
      const [member] = await executor.select({ name: user.name, email: user.email }).from(user)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id))
        .where(and(eq(user.id, userId), eq(user.emailVerified, true), eq(workspaceMembers.workspaceId, workspaceId))).limit(1);
      return member ?? null;
    },
    async saveHandoffIdentity(scope, profileId, identity) {
      const rows = await executor.update(clientProfiles).set({ ...identity, updatedAt: new Date() })
        .where(and(eq(clientProfiles.id, profileId), eq(clientProfiles.workspaceId, scope.workspaceId))).returning({ id: clientProfiles.id });
      if (!rows.length) throw new Error("profile_not_found");
      await executor.update(workspaces).set({ name: identity.name, updatedAt: new Date() }).where(and(
        eq(workspaces.id, scope.workspaceId),
        sql`(select count(*) from ${clientProfiles} where ${clientProfiles.workspaceId} = ${scope.workspaceId}) = 1`,
        sql`exists (select 1 from ${workspaceMembers} join ${user} on ${user.id} = ${workspaceMembers.userId}
          where ${workspaceMembers.workspaceId} = ${scope.workspaceId} and ${workspaceMembers.role} = 'owner'
          and ${workspaces.name} = coalesce(nullif(${user.name}, ''), ${user.email}) || ${"'s Workspace"})`,
      ));
    },
    async materializeHandoffAssets(scope, handoff, pages) {
      if (handoff.workspaceId !== scope.workspaceId || handoff.accountId !== scope.accountId) throw new Error("handoff_scope_mismatch");
      const items = handoffLibraryItems(handoff);
      const keptKeys = [...new Set([...items.map(item => item.key!), ...pages.map(page => page.key)])];
      for (const item of items) {
        const [asset] = await executor.select().from(workspaceAssets)
          .where(and(eq(workspaceAssets.workspaceId, scope.workspaceId), eq(workspaceAssets.key, item.key!))).limit(1);
        if (!asset || !canAdoptHandoffAsset(asset, handoff)) throw new Error("handoff_asset_not_found");
        await executor.update(workspaceAssets).set({ clientProfileId: handoff.clientProfileId, source: handoffAssetSource(item),
          metadata: sql`coalesce(${workspaceAssets.metadata}, '{}'::jsonb) || ${JSON.stringify(handoffAssetMetadata(handoff.id, item))}::jsonb`, updatedAt: new Date() })
          .where(eq(workspaceAssets.id, asset.id));
      }
      for (const page of pages) {
        await executor.insert(workspaceAssets).values({ workspaceId: scope.workspaceId, clientProfileId: handoff.clientProfileId,
          name: page.name, key: page.key, type: page.type, size: page.size, source: "brand_site", metadata: page.metadata })
          .onConflictDoNothing({ target: workspaceAssets.key });
      }
      const deleted = await executor.delete(workspaceAssets).where(and(
        eq(workspaceAssets.workspaceId, scope.workspaceId), isNull(workspaceAssets.clientProfileId),
        sql`${workspaceAssets.metadata}->>'handoffId' = ${handoff.id}`,
        sql`${workspaceAssets.metadata}->>'provisional' = 'true'`,
        keptKeys.length ? notInArray(workspaceAssets.key, keptKeys) : undefined,
      )).returning({ key: workspaceAssets.key });
      return deleted.map(asset => asset.key);
    },
    async getVerifiedWorkspaceOwner(workspaceId) {
      const [owner] = await executor.select({ userId: user.id, name: user.name, email: user.email }).from(user)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, user.id))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner"), eq(user.emailVerified, true)))
        .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.id)).limit(1);
      return owner ?? null;
    },
    async createClientProfile(workspaceId, name) {
      const [profile] = await executor.insert(clientProfiles).values({ workspaceId, name }).returning({ id: clientProfiles.id });
      if (!profile) throw new Error("profile_insert_failed");
      return profile;
    },
    staff: makePgStaff(executor),
    globalStops: makePgGlobalStops(executor),
    listAccounts: () => listAccounts(executor),
    claimDueIntents: (input) => claimDueIntents(executor, input),
    listAccountsByStatus: (status) => listAccountsByStatus(executor, status),
    async listFreeAccountsWithPendingNotifications() {
      return executor.selectDistinct(getTableColumns(equipeAccounts)).from(equipeEvents)
        .innerJoin(equipeAccounts, and(eq(equipeAccounts.id, equipeEvents.accountId),
          eq(equipeAccounts.workspaceId, equipeEvents.workspaceId)))
        .leftJoin(equipeNotificationDeliveries, and(eq(equipeNotificationDeliveries.eventId, equipeEvents.id),
          eq(equipeNotificationDeliveries.accountId, equipeEvents.accountId),
          eq(equipeNotificationDeliveries.workspaceId, equipeEvents.workspaceId)))
        .where(and(eq(equipeAccounts.status, "free"), eq(equipeEvents.eventType, "notification.requested"),
          sql`not coalesce(${equipeNotificationDeliveries.channels} @> '["completed"]'::jsonb
            or ${equipeNotificationDeliveries.channels} @> '["internal"]'::jsonb
            or ${equipeNotificationDeliveries.channels} @> '["skipped"]'::jsonb
            or ${equipeNotificationDeliveries.channels} @> '["inapp","email"]'::jsonb, false)`))
        .orderBy(asc(equipeAccounts.id));
    },
    listCalibrationRounds: (filter) => listCalibrationRounds(executor, filter),
    getCalibrationRound: (id) => getCalibrationRound(executor, id),
    getEscalation: (id) => getEscalation(executor, id),
    listFronts: () => listFronts(executor),
    listAccountLabels: () => listAccountLabels(executor),
  };
}

export type TxConcurrencyProbe = {
  /** Called with the in-flight query count at each query start inside a transaction. */
  onQueryStart?: (inFlight: number) => void;
};

export type PostgresEquipeUnitOfWorkOptions = {
  /** Test hook observing per-transaction query concurrency. */
  txConcurrencyProbe?: TxConcurrencyProbe;
};

function reportConcurrentTxQuery(inFlight: number): void {
  const message =
    `equipe_concurrent_tx_query: ${inFlight} queries in flight on the same transaction ` +
    `client; use sequential await inside transactions (breaks in pg@9, see #574)`;
  if (process.env.NODE_ENV === "production") {
    console.warn(message);
    return;
  }
  throw new Error(message);
}

// Minimal structural view of the drizzle internals the guard touches: every
// query through a transaction (builders, execute, relational reads) funnels
// through session.prepareQuery, and the prepared query runs in execute/all.
type GuardedPreparedQuery = {
  execute: (...args: unknown[]) => Promise<unknown>;
  all?: (...args: unknown[]) => Promise<unknown>;
};

type GuardableTxSession = {
  prepareQuery: (...args: unknown[]) => GuardedPreparedQuery;
};

function installTxConcurrencyGuard(
  tx: PostgresEquipeTransaction,
  probe?: TxConcurrencyProbe
): void {
  const session = (tx as unknown as { session?: GuardableTxSession }).session;
  if (!session || typeof session.prepareQuery !== "function") return;
  let inFlight = 0;
  const track = <T>(run: () => Promise<T>): Promise<T> => {
    inFlight += 1;
    probe?.onQueryStart?.(inFlight);
    if (inFlight > 1) reportConcurrentTxQuery(inFlight);
    // The counter must fall even when the query rejects, else one failure
    // would trip the guard for every later query in the transaction.
    return run().finally(() => {
      inFlight -= 1;
    });
  };
  const originalPrepare = session.prepareQuery.bind(session);
  session.prepareQuery = (...args: unknown[]): GuardedPreparedQuery => {
    const prepared = originalPrepare(...args);
    const originalExecute = prepared.execute.bind(prepared);
    prepared.execute = (...executeArgs: unknown[]) => track(() => originalExecute(...executeArgs));
    if (typeof prepared.all === "function") {
      const originalAll = prepared.all.bind(prepared);
      prepared.all = (...allArgs: unknown[]) => track(() => originalAll(...allArgs));
    }
    return prepared;
  };
}

export function createPostgresEquipeUnitOfWork(
  database: PostgresEquipeDatabase,
  options: PostgresEquipeUnitOfWorkOptions = {}
): EquipeUnitOfWork {
  return {
    repos: createPostgresEquipeRepositories(database),
    internal: createPostgresInternalEquipeRepositories(database),
    run: (fn) =>
      database.transaction((tx) => {
        // The session is fresh per transaction, so this instance-level wrap
        // cannot leak into other transactions or pooled checkouts.
        installTxConcurrencyGuard(tx, options.txConcurrencyProbe);
        return fn(
          createPostgresEquipeRepositories(tx),
          createPostgresInternalEquipeRepositories(tx)
        );
      }),
  };
}
