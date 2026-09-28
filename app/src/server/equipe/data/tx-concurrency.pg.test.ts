/**
 * Concorrência no client transacional (#574).
 *
 * Queries em paralelo sobre o mesmo client de transação emitem
 * DeprecationWarning no pg@8 e quebram no pg@9. Esta suíte prova no
 * Postgres real que o caminho representativo (dispatch gate, que carrega o
 * item review junto) roda com zero queries concorrentes no client da
 * transação — e que a guarda do unit of work dispara quando há
 * concorrência (controle negativo: sem ele, uma guarda inativa passaria).
 *
 * Banco de teste (ver ./test-database): TEST_DATABASE_URL quando definida
 * (local), senão DATABASE_URL cujo banco termina com `_test` (CI) — qualquer
 * outro caso pula a suíte:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/equipe/data/tx-concurrency.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { CommandContext } from "../module/shared";
import { resolveEquipeTestDatabaseUrl } from "./test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const TEST_DB_EXPLICITLY_CONFIGURED = TEST_DATABASE_URL !== null;

async function loadDb() {
  // Dynamic imports AFTER the DATABASE_URL routing above: the module graph
  // (dispatch-gate → publish-enabled → validation/env) and @/server/db read
  // the env at import time, and static imports would hoist above the routing
  // and connect to the wrong database.
  const [{ db }, schema, dispatchGate, itemShared] = await Promise.all([
    import("@/server/db"),
    import("@/server/db/schema"),
    import("../module/dispatch-gate"),
    import("../module/item-shared"),
  ]);
  const { createPostgresEquipeUnitOfWork } = await import("./postgres");
  return {
    db,
    schema,
    createPostgresEquipeUnitOfWork,
    buildDispatchGate: dispatchGate.buildDispatchGate,
    loadItemReview: itemShared.loadItemReview,
  };
}

const createdWorkspaceIds: string[] = [];

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  const { db, schema } = await loadDb();
  for (const workspaceId of createdWorkspaceIds.splice(0)) {
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  }
});

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("transação sem queries concorrentes (#574)", () => {
  async function newScope() {
    const { db, schema, createPostgresEquipeUnitOfWork, buildDispatchGate, loadItemReview } =
      await loadDb();
    let maxInFlight = 0;
    let queryCount = 0;
    const uow = createPostgresEquipeUnitOfWork(db, {
      txConcurrencyProbe: {
        onQueryStart: (inFlight) => {
          queryCount += 1;
          if (inFlight > maxInFlight) maxInFlight = inFlight;
        },
      },
    });
    const tag = `txconc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(schema.user).values({
      id: `user-${tag}`,
      name: "TxConcurrency",
      email: `${tag}@example.com`,
      emailVerified: true,
    });
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ name: tag, slug: tag })
      .returning();
    createdWorkspaceIds.push(workspace.id);
    const [profile] = await db
      .insert(schema.clientProfiles)
      .values({ workspaceId: workspace.id, name: tag })
      .returning();
    const account = await uow.repos.accounts.create(workspace.id, {
      clientProfileId: profile.id,
    });
    const scope = { workspaceId: workspace.id, accountId: account.id };
    const front = await uow.repos.fronts.create(scope, { key: "social_instagram" });
    const created = await uow.repos.items.create(scope, { frontId: front.id });
    const versionHash = "hash-tx-concurrency-1";
    await uow.repos.itemVersions.create(scope, {
      itemId: created.id,
      versionHash,
      creativeWorkOutputId: crypto.randomUUID(),
      authorRole: "agent",
    });
    const item = await uow.repos.items.update(scope, created.id, {
      currentVersionHash: versionHash,
    });
    const stats = () => ({ maxInFlight, queryCount });
    return { uow, scope, item, versionHash, stats, buildDispatchGate, loadItemReview };
  }

  it("dispatch gate + item review rodam sem concorrência no client da transação", async () => {
    const fixture = await newScope();
    const before = fixture.stats();
    const outcome = await fixture.uow.run(async (repos, internal) => {
      const ctx: CommandContext = {
        repos,
        internal,
        actor: { kind: "system", job: "tx-concurrency" },
        workspaceId: fixture.scope.workspaceId,
        accountId: fixture.scope.accountId,
        now: new Date(),
        events: [],
      };
      const gate = await fixture.buildDispatchGate(ctx, fixture.item);
      if (!gate.ok) throw new Error(`buildDispatchGate failed: ${gate.error.code}`);
      const review = await fixture.loadItemReview(repos, fixture.scope, fixture.item);
      return { gate: gate.value, review };
    });
    expect(outcome.gate.version.versionHash).toBe(fixture.versionHash);
    expect(outcome.review.status).toBe("ready");
    const after = fixture.stats();
    // A sonda viu queries (está viva) e nunca duas ao mesmo tempo.
    expect(after.queryCount - before.queryCount).toBeGreaterThan(0);
    expect(after.maxInFlight).toBe(1);
  });

  it("a guarda dispara quando duas queries concorrem na mesma transação", async () => {
    const fixture = await newScope();
    await expect(
      fixture.uow.run(async (repos) => {
        await Promise.all([
          repos.items.list(fixture.scope),
          repos.fronts.list(fixture.scope),
        ]);
      })
    ).rejects.toThrow(/equipe_concurrent_tx_query/);
  });
});
