/**
 * Contrato dos repositórios da Equipe contra Postgres REAL.
 *
 * O memory.test.ts prova o comportamento; ESTE teste prova a paridade da
 * implementação Postgres: escopo, unicidade, erros, idempotência, lease com
 * SKIP LOCKED e atomicidade da transação no banco migrado (0116).
 *
 * Banco de teste (ver ./test-database): TEST_DATABASE_URL quando definida
 * (local), senão DATABASE_URL cujo banco termina com `_test` (CI) — qualquer
 * outro caso pula a suíte, para que ela jamais escreva num banco de dev ou
 * produção:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/equipe/data/postgres.pg.test.ts
 */
import { eq } from "drizzle-orm";
import { equipeStaff } from "@/server/db/equipe-schema";
import { createPostgresEquipeUnitOfWork } from "./postgres";
import { defineEquipeRepositoryContract, type EquipeContractHarness } from "./repository-contract";
import { resolveEquipeTestDatabaseUrl } from "./test-database";
import type { AccountScope } from "./types";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
// O drizzle lê DATABASE_URL quando @/server/db carrega: roteia para o banco
// de teste resolvido ANTES dos imports dinâmicos abaixo. Imports estáticos
// içariam acima desta atribuição e conectariam no que DATABASE_URL apontar.
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const TEST_DB_EXPLICITLY_CONFIGURED = TEST_DATABASE_URL !== null;

let seq = 0;
const createdWorkspaceIds: string[] = [];

async function loadDb() {
  const [{ db }, schema] = await Promise.all([
    import("@/server/db"),
    import("@/server/db/schema"),
  ]);
  return { db, schema };
}

defineEquipeRepositoryContract(
  "Postgres",
  async (): Promise<EquipeContractHarness> => {
    const { db, schema } = await loadDb();
    const uow = createPostgresEquipeUnitOfWork(db);
    const createScope = async (): Promise<AccountScope> => {
      seq += 1;
      const tag = `equipe-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
      const userId = `user-${tag}`;
      await db.insert(schema.user).values({
        id: userId,
        name: "EquipeContract",
        email: `${tag}@example.com`,
        emailVerified: true,
      });
      const [workspace] = await db
        .insert(schema.workspaces)
        .values({ name: tag, slug: tag })
        .returning();
      const [profile] = await db
        .insert(schema.clientProfiles)
        .values({ workspaceId: workspace.id, name: tag })
        .returning();
      const account = await uow.repos.accounts.create(workspace.id, {
        clientProfileId: profile.id,
      });
      createdWorkspaceIds.push(workspace.id);
      return { workspaceId: workspace.id, accountId: account.id };
    };
    const scope = await createScope();
    const otherScope = await createScope();
    return { uow, scope, otherScope, createScope };
  },
  async () => {
    const { db, schema } = await loadDb();
    // Versões/recibos caem por CASCADE do workspace (o trigger permite
    // DELETE via CASCADE e rejeita só o DELETE/UPDATE direto).
    for (const workspaceId of createdWorkspaceIds.splice(0)) {
      await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    }
    // Staff é global (sem workspace): tabela usada só por esta suíte no banco
    // de teste, então limpar tudo remove exatamente o que o contrato criou.
    await db.delete(equipeStaff);
  },
  { enabled: TEST_DB_EXPLICITLY_CONFIGURED }
);
