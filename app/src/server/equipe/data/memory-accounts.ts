import type {
  EquipeAccountPersonRepository,
  EquipeAccountRepository,
  EquipeStaffRepository,
} from "./repositories";
import {
  assertUnique,
  buildRow,
  checkFields,
  copy,
  makeMemoryAccountRepo,
  stripUndefined,
  type MemoryEquipeStore,
} from "./memory-core";
import {
  EquipeConflictError,
  EquipeNotFoundError,
  equipeAccountStatusSchema,
  equipePersonRoleSchema,
  equipeStaffRoleSchema,
  type EquipeAccount,
  type EquipeAccountPerson,
  type EquipeStaffFilter,
  type EquipeStaffMember,
  type NewEquipeAccount,
  type NewEquipeAccountPerson,
  type NewEquipeStaffMember,
} from "./types";

// Agregado contas/pessoas em memória: contas (marca num workspace), pessoas
// da conta (lado cliente) e staff interno (global, sem escopo).

export function makeMemoryAccounts(store: MemoryEquipeStore): EquipeAccountRepository {
  const scoped = (workspaceId: string): EquipeAccount[] =>
    [...store.accounts.rows.values()].filter((row) => row.workspaceId === workspaceId);
  const keyOf = (row: EquipeAccount): string => `${row.workspaceId}:${row.clientProfileId}`;
  const validate = checkFields({ status: equipeAccountStatusSchema });
  return {
    async create(workspaceId, input: NewEquipeAccount) {
      validate(input);
      const now = new Date();
      const row: EquipeAccount = {
        id: crypto.randomUUID(),
        status: "deploying",
        launchedAt: null,
        closedAt: null,
        notes: null,
        ...stripUndefined(input),
        workspaceId,
        createdAt: now,
        updatedAt: now,
      } as EquipeAccount;
      if (scoped(workspaceId).some((existing) => keyOf(existing) === keyOf(row))) {
        throw new EquipeConflictError("equipe_conflict");
      }
      store.accounts.rows.set(row.id, row);
      return copy(row);
    },
    async get(workspaceId, accountId) {
      const row = store.accounts.rows.get(accountId);
      return row && row.workspaceId === workspaceId ? copy(row) : null;
    },
    async findByClientProfile(workspaceId, clientProfileId) {
      const found = scoped(workspaceId).find((row) => row.clientProfileId === clientProfileId);
      return found ? copy(found) : null;
    },
    async list(workspaceId) {
      return scoped(workspaceId).map(copy);
    },
    async update(workspaceId, accountId, patch) {
      const current = store.accounts.rows.get(accountId);
      if (!current || current.workspaceId !== workspaceId) {
        throw new EquipeNotFoundError("equipe_not_found");
      }
      validate(patch);
      const next: EquipeAccount = {
        ...current,
        ...stripUndefined(patch),
        id: current.id,
        workspaceId: current.workspaceId,
        updatedAt: new Date(),
      };
      if (
        scoped(workspaceId).some((row) => row.id !== current.id && keyOf(row) === keyOf(next))
      ) {
        throw new EquipeConflictError("equipe_conflict");
      }
      store.accounts.rows.set(accountId, next);
      return copy(next);
    },
  };
}

export function makeMemoryPeople(store: MemoryEquipeStore): EquipeAccountPersonRepository {
  return makeMemoryAccountRepo<
    EquipeAccountPerson,
    NewEquipeAccountPerson & Record<string, unknown>,
    Partial<NewEquipeAccountPerson> & Record<string, unknown>
  >({
    table: store.people,
    build: (scope, input) =>
      buildRow(scope, input, { active: true, userId: null, email: null }, "full"),
    validateCreate: checkFields({ role: equipePersonRoleSchema }, ["role"]),
    validatePatch: checkFields({ role: equipePersonRoleSchema }),
  });
}

export function makeMemoryStaff(store: MemoryEquipeStore): EquipeStaffRepository {
  const keyOf = (row: EquipeStaffMember): string | null =>
    row.userId === null ? null : `${row.userId}:${row.role}`;
  const validate = checkFields({ role: equipeStaffRoleSchema }, ["role"]);
  return {
    async create(input: NewEquipeStaffMember) {
      validate(input);
      const now = new Date();
      const row: EquipeStaffMember = {
        id: crypto.randomUUID(),
        active: true,
        userId: null,
        ...stripUndefined(input),
        createdAt: now,
        updatedAt: now,
      } as EquipeStaffMember;
      assertUnique([...store.staff.rows.values()], row, [keyOf]);
      store.staff.rows.set(row.id, row);
      return copy(row);
    },
    async get(id) {
      const row = store.staff.rows.get(id);
      return row ? copy(row) : null;
    },
    async list(filter?: EquipeStaffFilter) {
      return [...store.staff.rows.values()]
        .filter(
          (row) =>
            (filter?.role === undefined || row.role === filter.role) &&
            (filter?.active === undefined || row.active === filter.active)
        )
        .map(copy);
    },
    async update(id, patch) {
      const current = store.staff.rows.get(id);
      if (!current) throw new EquipeNotFoundError("equipe_not_found");
      checkFields({ role: equipeStaffRoleSchema })(patch);
      const next: EquipeStaffMember = {
        ...current,
        ...stripUndefined(patch),
        id: current.id,
        updatedAt: new Date(),
      };
      assertUnique([...store.staff.rows.values()], next, [keyOf], current.id);
      store.staff.rows.set(id, next);
      return copy(next);
    },
  };
}
