import type {
  EquipeRepositories,
  EquipeUnitOfWork,
  InternalEquipeRepositories,
} from "./repositories";
import {
  cloneStore,
  commitStore,
  createMemoryEquipeStore,
  type MemoryEquipeStore,
} from "./memory-core";
import { makeMemoryAccounts, makeMemoryPeople, makeMemoryStaff } from "./memory-accounts";
import { makeMemoryPlanningRepositories } from "./memory-planning";
import { makeMemoryProductionRepositories } from "./memory-production";
import { makeMemoryGovernanceRepositories } from "./memory-governance";
import {
  claimMemoryDueIntents,
  listMemoryAccountsByStatus,
  listMemoryCalibrationRounds,
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

export function createMemoryEquipeRepositories(store: MemoryEquipeStore): EquipeRepositories {
  return {
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
    staff: makeMemoryStaff(store),
    claimDueIntents: (input) => claimMemoryDueIntents(store, input),
    listAccountsByStatus: (status) => listMemoryAccountsByStatus(store, status),
    listCalibrationRounds: (filter) => listMemoryCalibrationRounds(store, filter),
  };
}

export function createMemoryEquipeUnitOfWork(
  store: MemoryEquipeStore = createMemoryEquipeStore()
): EquipeUnitOfWork {
  return {
    repos: createMemoryEquipeRepositories(store),
    internal: createMemoryInternalEquipeRepositories(store),
    run: async (fn) => {
      const draft = cloneStore(store);
      const result = await fn(
        createMemoryEquipeRepositories(draft),
        createMemoryInternalEquipeRepositories(draft)
      );
      commitStore(store, draft);
      return result;
    },
  };
}
