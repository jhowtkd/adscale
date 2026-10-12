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
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { equipeAgentLedger } from "@/server/db/equipe-schema";
import { fromSaoPauloWallTime } from "../domain";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const TEST_DB_EXPLICITLY_CONFIGURED = TEST_DATABASE_URL !== null;

async function loadDb() {
  const [{ db }, schema, { DrizzleLedgerStore }] = await Promise.all([
    import("@/server/db"),
    import("@/server/db/schema"),
    // ledger imports the production pool: load only AFTER resolving the test URL.
    import("./ledger"),
  ]);
  // Fail before any write even if another import cached a different pool.
  if (!TEST_DATABASE_URL || db.$client.options.connectionString !== TEST_DATABASE_URL) {
    throw new Error("ledger_test_database_mismatch");
  }
  const [{ name }] = (await db.execute(sql`select current_database() as name`)).rows as {
    name: string;
  }[];
  const expectedDatabase = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (name !== expectedDatabase) throw new Error("ledger_test_database_name_mismatch");
  const { createPostgresEquipeUnitOfWork } = await import("../data/postgres");
  return { db, schema, createPostgresEquipeUnitOfWork, DrizzleLedgerStore };
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
  it("migration 0136 keeps historical hashes null and preserves every existing field", async () => {
    const { db } = await loadDb();
    const pool = db.$client;
    const schema = `ledger_migration_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE SCHEMA "${schema}"`);
    try {
      await pool.query(`CREATE TABLE "${schema}"."equipe_agent_ledger" (
        id uuid PRIMARY KEY, workspace_id uuid NOT NULL, account_id uuid NOT NULL,
        role text NOT NULL, model text NOT NULL, prompt_version text NOT NULL, task_kind text NOT NULL,
        input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0,
        cost_usd_cents integer NOT NULL DEFAULT 0, reserved_cost_usd_cents integer,
        reservation_expires_at timestamp, settled_at timestamp, created_at timestamp NOT NULL DEFAULT now()
      )`);
      await pool.query(`INSERT INTO "${schema}"."equipe_agent_ledger" VALUES (
        $1, $2, $3, 'strategist', 'claude-opus-5-5', 'historical/v1', 'strategist_turn',
        1000, 500, 2, 7, '2026-01-15 13:15:00', '2026-01-15 13:03:00', '2026-01-15 13:00:00'
      )`, [randomUUID(), randomUUID(), randomUUID()]);
      const readRows = async () => (await pool.query<Record<string, unknown>>(
        `SELECT * FROM "${schema}"."equipe_agent_ledger" ORDER BY id`,
      )).rows;
      const historical = await readRows();
      expect(historical).toHaveLength(1);
      expect(historical[0]).not.toHaveProperty("set_hash");

      const migration = readFileSync(new URL("../../../../drizzle/0136_equipe_learned_set_hash.sql", import.meta.url), "utf8")
        .replaceAll('"adscale_equipe"', `"${schema}"`);
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) await pool.query(statement);
      }

      expect(await readRows()).toEqual(historical.map(row => ({ ...row, set_hash: null })));
    } finally {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  });

  it.each([undefined, null, "a".repeat(64)])("persists the learned set hash (%s) unchanged through settlement", async (setHash) => {
    const { db, DrizzleLedgerStore } = await loadDb();
    const store = new DrizzleLedgerStore(db);
    const scope = await createAccount();
    const entry = await store.record({
      ...scope, role: "strategist", model: "claude-opus-5-5", promptVersion: "equipe-prompts/v6",
      taskKind: "strategist_turn", setHash, inputTokens: 0, outputTokens: 0,
      costUsdCents: 7, reservedCostUsdCents: 7,
    });
    expect(entry.setHash).toBe(setHash ?? null);
    const read = async () => (await db.select().from(equipeAgentLedger).where(eq(equipeAgentLedger.id, entry.id)))[0];
    expect(await read()).toMatchObject({ setHash: setHash ?? null, costUsdCents: 7, reservedCostUsdCents: 7, settledAt: null });
    const at = new Date("2026-10-15T15:00:00.000Z");
    await store.settle(scope, entry.id, {
      model: entry.model, setHash: "b".repeat(64), inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0,
    }, 1, at);
    expect(await read()).toMatchObject({ setHash: setHash ?? null, promptVersion: "equipe-prompts/v6",
      costUsdCents: 1, reservedCostUsdCents: 7, inputTokens: 100, outputTokens: 10, settledAt: at });
    expect(await store.lifetimeTotalCostUsdCents(scope.workspaceId, scope.accountId)).toBe(1);
  });

  it("sums the current São Paulo month scoped to the account", async () => {
    const { db, DrizzleLedgerStore } = await loadDb();
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
        promptVersion: "equipe-prompts/v6",
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
    const { db, DrizzleLedgerStore } = await loadDb();
    const store = new DrizzleLedgerStore(db);
    const a = await createAccount();
    const entry = await store.record({
      workspaceId: a.workspaceId,
      accountId: a.accountId,
      role: "research",
      model: "gpt-5.6-sol",
      promptVersion: "equipe-prompts/v6",
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
