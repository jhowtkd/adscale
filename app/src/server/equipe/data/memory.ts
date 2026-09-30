import { EquipeConflictError, type EquipeAccount, type EquipeTaskIntent, type NewEquipeTaskIntent, type EquipeBrandHandoff, type NewEquipeBrandHandoff } from "./types";
import type {
  EquipeRepositories,
  EquipeUnitOfWork,
  InternalEquipeRepositories,
} from "./repositories";
import {
  buildRow,
  inScope,
  makeMemoryAppendRepo,
  copy,
  cloneStore,
  commitStore,
  createMemoryEquipeStore,
  type MemoryEquipeStore,
} from "./memory-core";
import { makeMemoryAccounts, makeMemoryPeople, makeMemoryStaff } from "./memory-accounts";
import { makeMemoryPlanningRepositories } from "./memory-planning";
import { makeMemoryProductionRepositories } from "./memory-production";
import { makeMemoryGlobalStops, makeMemoryGovernanceRepositories } from "./memory-governance";
import {
  claimMemoryDueIntents,
  getMemoryCalibrationRound,
  getMemoryEscalation,
  listMemoryAccountLabels,
  listMemoryAccounts,
  listMemoryAccountsByStatus,
  listMemoryCalibrationRounds,
  listMemoryFronts,
  makeMemoryDispatchRepositories,
} from "./memory-dispatch";

// Implementação em memória dos repositórios da Equipe, com o mesmo
// comportamento da Postgres: escopo, unicidade, erros, insert idempotente,
// claim com lease e transações (cópia + commit). Usada pelos testes do
// futuro módulo de regras; o contrato compartilhado cobra a paridade.
//
// Composição: a loja e as fábricas genéricas vivem em memory-core, cada
// agregado no seu módulo memory-*; este arquivo só monta os repositórios e
// a unidade de trabalho (mesma API pública de antes).
export { MemoryTable, createMemoryEquipeStore, type MemoryEquipeStore } from "./memory-core";
export { seedMemoryAdscaleLabels } from "./memory-dispatch";

export function createMemoryEquipeRepositories(store: MemoryEquipeStore): EquipeRepositories {
  return {
    taskOutbox: {
      ...makeMemoryAppendRepo<EquipeTaskIntent, NewEquipeTaskIntent>({
        table: store.taskOutbox,
        build: (scope, input) => buildRow(scope, input, { dispatchedAt: null }, "created"),
        validateCreate: (input) => {
          if (store.taskOutbox.rows.has(input.id)) throw new EquipeConflictError("equipe_conflict");
        },
      }),
      async markDispatched(scope, id, at) {
        const row = store.taskOutbox.rows.get(id);
        if (row && inScope(row, scope)) row.dispatchedAt = at;
      },
    },
    handoffs: makeMemoryAppendRepo<EquipeBrandHandoff, NewEquipeBrandHandoff>({
      table: store.handoffs,
      build: (scope, input) => buildRow(scope, input, { step: "source", version: 1 }, "full"),
      uniques: [(row) => row.accountId],
    }),
    conversations: {
      async get(workspaceId, threadId) {
        const row = store.assistantThreads.rows.get(threadId);
        return row?.workspaceId === workspaceId ? { ...row } : null;
      },
      async ensurePrimary(workspaceId, clientProfileId) {
        const existing = [...store.assistantThreads.rows.values()].find((row) =>
          row.workspaceId === workspaceId && row.clientProfileId === clientProfileId && !row.campaignId);
        if (existing) return { ...existing };
        const row = { id: crypto.randomUUID(), workspaceId, clientProfileId, campaignId: null };
        store.assistantThreads.rows.set(row.id, row);
        return { ...row };
      },
      async post(workspaceId, sourceEventId, input) {
        const thread = store.assistantThreads.rows.get(input.threadId);
        if (thread?.workspaceId !== workspaceId) throw new Error("Thread not found");
        const existing = store.assistantMessages.rows.get(sourceEventId);
        if (existing && (existing.workspaceId !== workspaceId || existing.threadId !== input.threadId)) {
          throw new Error("Message source belongs to another thread");
        }
        if (!existing) store.assistantMessages.rows.set(sourceEventId, { ...input, workspaceId, id: sourceEventId });
        return { id: sourceEventId };
      },
    },
    accounts: makeMemoryAccounts(store),
    people: makeMemoryPeople(store),
    ...makeMemoryPlanningRepositories(store),
    ...makeMemoryProductionRepositories(store),
    ...makeMemoryGovernanceRepositories(store),
    ...makeMemoryDispatchRepositories(store),
  };
}

export function createMemoryInternalEquipeRepositories(
  store: MemoryEquipeStore
): InternalEquipeRepositories {
  return {
    async listWorkspaceIds(options) {
      const ids = [...store.adscaleWorkspaces.rows.keys()].sort().filter((id) => !options?.after || id > options.after);
      return options?.limit === undefined ? ids : ids.slice(0, options.limit);
    },
    async listPendingTaskIntents() {
      return [...store.taskOutbox.rows.values()].filter((row) => !row.dispatchedAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(copy);
    },
    async lockWorkspace() { /* The memory unit of work serializes transactions. */ },
    async getVerifiedWorkspaceMember(workspaceId, userId) {
      const member = [...store.workspaceMembers.rows.values()].find((row) => row.workspaceId === workspaceId && row.userId === userId && row.emailVerified);
      return member ? { name: member.name, email: member.email } : null;
    },
    async getVerifiedWorkspaceOwner(workspaceId) {
      const [owner] = [...store.workspaceMembers.rows.values()]
        .filter((row) => row.workspaceId === workspaceId && row.role === "owner" && row.emailVerified)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
      return owner ? { userId: owner.userId, name: owner.name, email: owner.email } : null;
    },
    async createClientProfile(workspaceId, name) {
      const row = { id: crypto.randomUUID(), workspaceId, name };
      store.adscaleProfiles.rows.set(row.id, row);
      return { id: row.id };
    },
    staff: makeMemoryStaff(store),
    globalStops: makeMemoryGlobalStops(store),
    listAccounts: () => listMemoryAccounts(store),
    claimDueIntents: (input) => claimMemoryDueIntents(store, input),
    listAccountsByStatus: (status) => listMemoryAccountsByStatus(store, status),
    async listFreeAccountsWithPendingNotifications() {
      const terminal = new Set([...store.deliveries.rows.values()]
        .filter(({ channels }) => channels.includes("completed") || channels.includes("internal")
          || channels.includes("skipped") || (channels.includes("inapp") && channels.includes("email")))
        .map((row) => `${row.workspaceId}:${row.accountId}:${row.eventId}`));
      const found = new Map<string, EquipeAccount>();
      for (const event of store.events.rows.values()) {
        if (event.eventType !== "notification.requested"
          || terminal.has(`${event.workspaceId}:${event.accountId}:${event.id}`)) continue;
        const account = store.accounts.rows.get(event.accountId);
        if (account?.status === "free" && account.workspaceId === event.workspaceId) found.set(account.id, account);
      }
      return [...found.values()].sort((a, b) => a.id.localeCompare(b.id)).map(copy);
    },
    listCalibrationRounds: (filter) => listMemoryCalibrationRounds(store, filter),
    getCalibrationRound: (id) => getMemoryCalibrationRound(store, id),
    getEscalation: (id) => getMemoryEscalation(store, id),
    listFronts: () => listMemoryFronts(store),
    listAccountLabels: () => listMemoryAccountLabels(store),
  };
}

// ponytail: serialize the whole fake store; use per-row locks if memory-store throughput matters.
const transactions = new WeakMap<MemoryEquipeStore, Promise<void>>();

export function createMemoryEquipeUnitOfWork(
  store: MemoryEquipeStore = createMemoryEquipeStore()
): EquipeUnitOfWork {
  return {
    repos: createMemoryEquipeRepositories(store),
    internal: createMemoryInternalEquipeRepositories(store),
    run: (fn) => {
      const result = (transactions.get(store) ?? Promise.resolve()).then(async () => {
        const draft = cloneStore(store);
        const value = await fn(
          createMemoryEquipeRepositories(draft),
          createMemoryInternalEquipeRepositories(draft)
        );
        commitStore(store, draft);
        return value;
      });
      transactions.set(store, result.then(() => {}, () => {}));
      return result;
    },
  };
}
