import { createMemoryEquipeStore, createMemoryEquipeUnitOfWork } from "./memory";
import { defineEquipeRepositoryContract } from "./repository-contract";
import type { AccountScope } from "./types";

// Contrato contra a implementação em memória: sem banco, roda local e no CI.
defineEquipeRepositoryContract("memória", async () => {
  const store = createMemoryEquipeStore();
  const uow = createMemoryEquipeUnitOfWork(store);
  const createScope = async (): Promise<AccountScope> => {
    const workspaceId = crypto.randomUUID();
    const account = await uow.repos.accounts.create(workspaceId, {
      clientProfileId: crypto.randomUUID(),
    });
    return { workspaceId, accountId: account.id };
  };
  const scope = await createScope();
  const otherScope = await createScope();
  return { uow, scope, otherScope, createScope };
});
