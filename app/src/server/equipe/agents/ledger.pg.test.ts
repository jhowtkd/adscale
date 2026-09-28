/**
 * DrizzleLedgerStore contra Postgres REAL.
 *
 * O ledger.test.ts prova o comportamento em memória; ESTA suíte prova que a
 * implementação Postgres soma o mês vigente em America/Sao_Paulo com escopo
 * de conta: linhas de outro mês e de outra conta não entram no total.
 *
 * Banco de teste (ver ../data/test-database): TEST_DATABASE_URL quando
 * definida (local), senão DATABASE_URL cujo banco termina com `_test` (CI)
 * — qualquer outro caso pula a suíte:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/equipe/agents/ledger.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { equipeAgentLedger } from "@/server/db/equipe-schema";
import { fromSaoPauloWallTime } from "../domain";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { DrizzleLedgerStore } from "./ledger";
import { EQUIPE_PROMPT_VERSION } from "./prompts";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const TEST_DB_EXPLICITLY_CONFIGURED = TEST_DATABASE_URL !== null;

async function loadDb() {
  const [{ db }, schema] = await Promise.all([
    import("@/server/db"),
    import("@/server/db/schema"),
  ]);
  const { createPostgresEquipeUnitOfWork } = await import("../data/postgres");
  return { db, schema, createPostgresEquipeUnitOfWork };
}

const createdWorkspaceIds: string[] = [];
let seq = 0;

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  const { db, schema } = await loadDb();
  // O ledger cai por CASCADE do workspace (FK workspace_id e account_id).
  for (const workspaceId of createdWorkspaceIds.splice(0)) {
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  }
});

async function createAccount(): Promise<{ workspaceId: string; accountId: string }> {
  const { db, schema, createPostgresEquipeUnitOfWork } = await loadDb();
  seq += 1;
  const tag = `ledger-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.user).values({
    id: `user-${tag}`,
    name: "LedgerPg",
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
  const uow = createPostgresEquipeUnitOfWork(db);
  const account = await uow.repos.accounts.create(workspace.id, {
    clientProfileId: profile.id,
  });
  createdWorkspaceIds.push(workspace.id);
  return { workspaceId: workspace.id, accountId: account.id };
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("DrizzleLedgerStore (pg)", () => {
  it("sums the current São Paulo month scoped to the account", async () => {
    const { db } = await loadDb();
    const store = new DrizzleLedgerStore(db);
    const a = await createAccount();
    const b = await createAccount();
    const now = fromSaoPauloWallTime(2026, 10, 15, 12, 0);

    const rows = [
      // Conta A, mês vigente: contam.
      { ...a, costUsdCents: 40, createdAt: fromSaoPauloWallTime(2026, 10, 1, 9, 0) },
      { ...a, costUsdCents: 60, createdAt: fromSaoPauloWallTime(2026, 10, 15, 11, 59) },
      // Conta A, mês anterior: não conta.
      { ...a, costUsdCents: 9999, createdAt: fromSaoPauloWallTime(2026, 9, 30, 23, 59) },
      // Conta B, mês vigente: conta só para a conta B.
      { ...b, costUsdCents: 7, createdAt: fromSaoPauloWallTime(2026, 10, 10, 10, 0) },
    ];
    for (const row of rows) {
      await db.insert(equipeAgentLedger).values({
        workspaceId: row.workspaceId,
        accountId: row.accountId,
        role: "strategist",
        model: "gpt-5.6-sol",
        promptVersion: EQUIPE_PROMPT_VERSION,
        taskKind: "strategist_turn",
        inputTokens: 0,
        outputTokens: 0,
        costUsdCents: row.costUsdCents,
        createdAt: row.createdAt,
      });
    }

    expect(await store.monthlyTotalCostUsdCents(a.workspaceId, a.accountId, now)).toBe(100);
    expect(await store.monthlyTotalCostUsdCents(b.workspaceId, b.accountId, now)).toBe(7);
    expect(
      await store.monthlyTotalCostUsdCents(a.workspaceId, a.accountId, fromSaoPauloWallTime(2026, 9, 15, 12, 0)),
    ).toBe(9999);
  });

  it("records a call and reads it back", async () => {
    const { db } = await loadDb();
    const store = new DrizzleLedgerStore(db);
    const a = await createAccount();
    const entry = await store.record({
      workspaceId: a.workspaceId,
      accountId: a.accountId,
      role: "research",
      model: "gpt-5.6-sol",
      promptVersion: EQUIPE_PROMPT_VERSION,
      taskKind: "research",
      inputTokens: 1000,
      outputTokens: 100,
      costUsdCents: 1,
    });
    expect(entry.id).toBeTruthy();
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(await store.monthlyTotalCostUsdCents(a.workspaceId, a.accountId, new Date())).toBe(1);
  });
});
