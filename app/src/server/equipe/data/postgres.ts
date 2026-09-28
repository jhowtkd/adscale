import { and, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { db as appDb } from "../../db/index";
import {
  equipeAccountPeople,
  equipeAccounts,
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
  listAccountsByStatus,
  listCalibrationRounds,
  makePgConnections,
  makePgDeliveries,
  makePgEvents,
  makePgIntents,
  makePgThreads,
} from "./postgres-dispatch";

// Implementação Postgres dos repositórios da Equipe. Recebe o executor
// (db ou transação) por parâmetro — nunca importa o db global, para os
// testes unitários poderem importar este módulo sem DATABASE_URL.
export type PostgresEquipeDatabase = typeof appDb;
export type PostgresEquipeTransaction = Parameters<
  Parameters<PostgresEquipeDatabase["transaction"]>[0]
>[0];
export type PostgresEquipeExecutor = Pick<
  PostgresEquipeDatabase,
  "insert" | "select" | "update" | "execute"
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
  id: string
): Promise<T["$inferSelect"] | null> {
  const rows = (await executor
    .select()
    .from(table as PgTable)
    .where(and(...scopeConditions(table, scope), eq(table.id, id)))
    .limit(1)) as T["$inferSelect"][];
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
    get: (scope, id) => pgGet(executor, opts.table, scope, id),
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
    get: (scope, id) => pgGet(executor, opts.table, scope, id),
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
    async get(workspaceId: string, accountId: string): Promise<EquipeAccount | null> {
      const rows = await executor
        .select()
        .from(equipeAccounts)
        .where(
          and(
            eq(equipeAccounts.workspaceId, workspaceId),
            eq(equipeAccounts.id, accountId)
          )
        )
        .limit(1);
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
    staff: makePgStaff(executor),
    claimDueIntents: (input) => claimDueIntents(executor, input),
    listAccountsByStatus: (status) => listAccountsByStatus(executor, status),
    listCalibrationRounds: (filter) => listCalibrationRounds(executor, filter),
  };
}

export function createPostgresEquipeUnitOfWork(
  database: PostgresEquipeDatabase
): EquipeUnitOfWork {
  return {
    repos: createPostgresEquipeRepositories(database),
    internal: createPostgresInternalEquipeRepositories(database),
    run: (fn) =>
      database.transaction((tx) =>
        fn(createPostgresEquipeRepositories(tx), createPostgresInternalEquipeRepositories(tx))
      ),
  };
}
