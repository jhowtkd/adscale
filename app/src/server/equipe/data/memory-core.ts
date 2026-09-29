import type { z } from "zod";
import type {
  AccountScopedRepository,
  AppendOnlyRepository,
} from "./repositories";
import type {
  AccountScope,
  EquipeAccount,
  EquipeAccountPerson,
  EquipeBatch,
  EquipeCalibrationRound,
  EquipeCalibrationScore,
  EquipeConnection,
  EquipeContextVersion,
  EquipeEscalation,
  EquipeEvent,
  EquipeException,
  EquipeFront,
  EquipeGlobalStop,
  EquipeIdea,
  EquipeItem,
  EquipeItemVersion,
  EquipeMandate,
  EquipeNotificationDelivery,
  EquipeOnboardingStep,
  EquipePause,
  EquipePlan,
  EquipePublicationIntent,
  EquipeReceipt,
  EquipeStaffMember,
  EquipeThread,
} from "./types";
import { EquipeConflictError, EquipeNotFoundError } from "./types";
import type { ConversationThread } from "./repositories";
import type { CreateAssistantMessageInput } from "../../repositories/assistant-message";

// Núcleo da implementação em memória: loja (tabelas), construção de linhas,
// validações que espelham os checks do banco e as fábricas genéricas de
// repositórios com escopo e append-only. Os agregados vivem nos módulos
// memory-*; a composição pública continua em memory.ts.

export type ScopedRow = { id: string; workspaceId: string; accountId: string };

export class MemoryTable<R extends { id: string }> {
  rows = new Map<string, R>();
}

// Brand/workspace names backing the internal label join in memory. Plain
// tables so clone/commit treat them like every other table; tests seed
// them through seedMemoryAdscaleLabels (testing only, never commands).
export type MemoryAdscaleProfile = { id: string; workspaceId: string; name: string };
export type MemoryAdscaleWorkspace = { id: string; name: string };

export type MemoryEquipeStore = {
  assistantThreads: MemoryTable<ConversationThread>;
  assistantMessages: MemoryTable<CreateAssistantMessageInput & { id: string; workspaceId: string }>;
  accounts: MemoryTable<EquipeAccount>;
  adscaleProfiles: MemoryTable<MemoryAdscaleProfile>;
  adscaleWorkspaces: MemoryTable<MemoryAdscaleWorkspace>;
  people: MemoryTable<EquipeAccountPerson>;
  staff: MemoryTable<EquipeStaffMember>;
  fronts: MemoryTable<EquipeFront>;
  // #583 — parada global (fonte única, sem escopo).
  globalStops: MemoryTable<EquipeGlobalStop>;
  onboarding: MemoryTable<EquipeOnboardingStep>;
  contexts: MemoryTable<EquipeContextVersion>;
  plans: MemoryTable<EquipePlan>;
  mandates: MemoryTable<EquipeMandate>;
  ideas: MemoryTable<EquipeIdea>;
  batches: MemoryTable<EquipeBatch>;
  items: MemoryTable<EquipeItem>;
  itemVersions: MemoryTable<EquipeItemVersion>;
  receipts: MemoryTable<EquipeReceipt>;
  calibrationRounds: MemoryTable<EquipeCalibrationRound>;
  calibrationScores: MemoryTable<EquipeCalibrationScore>;
  escalations: MemoryTable<EquipeEscalation>;
  exceptions: MemoryTable<EquipeException>;
  pauses: MemoryTable<EquipePause>;
  intents: MemoryTable<EquipePublicationIntent>;
  connections: MemoryTable<EquipeConnection>;
  threads: MemoryTable<EquipeThread>;
  events: MemoryTable<EquipeEvent>;
  deliveries: MemoryTable<EquipeNotificationDelivery>;
};

export function createMemoryEquipeStore(): MemoryEquipeStore {
  return {
    assistantThreads: new MemoryTable(),
    assistantMessages: new MemoryTable(),
    accounts: new MemoryTable(),
    adscaleProfiles: new MemoryTable(),
    adscaleWorkspaces: new MemoryTable(),
    people: new MemoryTable(),
    staff: new MemoryTable(),
    fronts: new MemoryTable(),
    globalStops: new MemoryTable(),
    onboarding: new MemoryTable(),
    contexts: new MemoryTable(),
    plans: new MemoryTable(),
    mandates: new MemoryTable(),
    ideas: new MemoryTable(),
    batches: new MemoryTable(),
    items: new MemoryTable(),
    itemVersions: new MemoryTable(),
    receipts: new MemoryTable(),
    calibrationRounds: new MemoryTable(),
    calibrationScores: new MemoryTable(),
    exceptions: new MemoryTable(),
    escalations: new MemoryTable(),
    pauses: new MemoryTable(),
    intents: new MemoryTable(),
    connections: new MemoryTable(),
    threads: new MemoryTable(),
    events: new MemoryTable(),
    deliveries: new MemoryTable(),
  };
}

export type StampKind = "full" | "created" | "occurred";

export function buildRow<R>(
  scope: AccountScope,
  input: Record<string, unknown>,
  defaults: Record<string, unknown>,
  stamps: StampKind
): R {
  const now = new Date();
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) clean[key] = value;
  }
  const stamp =
    stamps === "full"
      ? { createdAt: now, updatedAt: now }
      : stamps === "created"
        ? { createdAt: now }
        : { occurredAt: now };
  // Like the Postgres DEFAULTs, stamps only fill what the input omits: an
  // explicit occurredAt (appendEvent always passes the command clock) wins,
  // so fixed-clock tests observe deterministic event times on both stores.
  return { id: crypto.randomUUID(), ...stamp, ...defaults, ...clean, ...scope } as R;
}

// Valida campos enumerados (espelha os checks do banco); campos opcionais
// só são validados quando presentes.
export function checkFields(
  spec: Record<string, z.ZodTypeAny>,
  required: string[] = []
): (input: Record<string, unknown>) => void {
  return (input) => {
    for (const [field, schema] of Object.entries(spec)) {
      const value = input[field];
      if (value === undefined) {
        if (required.includes(field)) throw new Error(`equipe_missing_${field}`);
        continue;
      }
      schema.parse(value);
    }
  };
}

export function asList<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

export type UniqueKey<R> = (row: R) => string | null;

export function assertUnique<R extends { id: string }>(
  rows: R[],
  candidate: R,
  uniques: Array<UniqueKey<R>>,
  ignoreId?: string
): void {
  for (const keyOf of uniques) {
    const key = keyOf(candidate);
    if (key === null) continue;
    const clash = rows.find((row) => row.id !== ignoreId && keyOf(row) === key);
    if (clash) throw new EquipeConflictError("equipe_conflict");
  }
}

export function inScope<R extends ScopedRow>(row: R, scope: AccountScope): boolean {
  return row.workspaceId === scope.workspaceId && row.accountId === scope.accountId;
}

export function copy<R>(row: R): R {
  return { ...row };
}

export function stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) clean[key] = value;
  }
  return clean as Partial<T>;
}

export function makeMemoryAccountRepo<
  R extends ScopedRow,
  C extends Record<string, unknown>,
  P extends Record<string, unknown>,
  F = undefined,
>(opts: {
  table: MemoryTable<R>;
  build: (scope: AccountScope, input: C) => R;
  uniques?: Array<UniqueKey<R>>;
  validateCreate?: (input: C) => void;
  validatePatch?: (patch: P) => void;
  filter?: (rows: R[], filter: F) => R[];
}): AccountScopedRepository<R, C, P, F> {
  const scoped = (scope: AccountScope): R[] =>
    [...opts.table.rows.values()].filter((row) => inScope(row, scope));
  return {
    async create(scope, input) {
      opts.validateCreate?.(input);
      const row = opts.build(scope, input);
      assertUnique(scoped(scope), row, opts.uniques ?? []);
      opts.table.rows.set(row.id, row);
      return copy(row);
    },
    async get(scope, id) {
      const row = opts.table.rows.get(id);
      return row && inScope(row, scope) ? copy(row) : null;
    },
    async list(scope, filter) {
      const rows = scoped(scope).map(copy);
      return filter === undefined ? rows : (opts.filter?.(rows, filter) ?? rows);
    },
    async update(scope, id, patch) {
      const current = opts.table.rows.get(id);
      if (!current || !inScope(current, scope)) throw new EquipeNotFoundError("equipe_not_found");
      opts.validatePatch?.(patch);
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) clean[key] = value;
      }
      const next = {
        ...current,
        ...clean,
        id: current.id,
        workspaceId: current.workspaceId,
        accountId: current.accountId,
        ...("updatedAt" in current ? { updatedAt: new Date() } : {}),
      } as R;
      assertUnique(scoped(scope), next, opts.uniques ?? [], current.id);
      opts.table.rows.set(id, next);
      return copy(next);
    },
  };
}

export function makeMemoryAppendRepo<
  R extends ScopedRow,
  C extends Record<string, unknown>,
  F = undefined,
>(opts: {
  table: MemoryTable<R>;
  build: (scope: AccountScope, input: C) => R;
  uniques?: Array<UniqueKey<R>>;
  validateCreate?: (input: C) => void;
  filter?: (rows: R[], filter: F) => R[];
  sort?: (rows: R[]) => R[];
}): AppendOnlyRepository<R, C, F> {
  const scoped = (scope: AccountScope): R[] =>
    [...opts.table.rows.values()].filter((row) => inScope(row, scope));
  return {
    async create(scope, input) {
      opts.validateCreate?.(input);
      const row = opts.build(scope, input);
      assertUnique(scoped(scope), row, opts.uniques ?? []);
      opts.table.rows.set(row.id, row);
      return copy(row);
    },
    async get(scope, id) {
      const row = opts.table.rows.get(id);
      return row && inScope(row, scope) ? copy(row) : null;
    },
    async list(scope, filter) {
      let rows = scoped(scope).map(copy);
      if (filter !== undefined) rows = opts.filter?.(rows, filter) ?? rows;
      return opts.sort ? opts.sort(rows) : rows;
    },
  };
}

// Transação em memória: clona a loja, executa sobre o rascunho e confirma
// trocando os mapas — erro antes do commit descarta tudo.
export function cloneStore(store: MemoryEquipeStore): MemoryEquipeStore {
  const draft = createMemoryEquipeStore();
  for (const key of Object.keys(store) as Array<keyof MemoryEquipeStore>) {
    const source = store[key] as MemoryTable<{ id: string }>;
    const target = draft[key] as MemoryTable<{ id: string }>;
    for (const [id, row] of source.rows) {
      target.rows.set(id, structuredClone(row));
    }
  }
  return draft;
}

export function commitStore(store: MemoryEquipeStore, draft: MemoryEquipeStore): void {
  for (const key of Object.keys(store) as Array<keyof MemoryEquipeStore>) {
    (store[key] as MemoryTable<{ id: string }>).rows = (
      draft[key] as MemoryTable<{ id: string }>
    ).rows;
  }
}
