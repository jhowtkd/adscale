/**
 * Imutabilidade de recibos e versões no BANCO (trigger da 0116).
 *
 * Os repositórios não expõem update/delete nessas tabelas; ESTA suíte prova
 * no Postgres real que UPDATE direto e DELETE direto em SQL falham (erro
 * equipe_immutable do trigger), enquanto DELETE por CASCADE de FK (excluir o
 * workspace, a conta ou o item) conclui — sem nenhuma válvula de sessão.
 *
 * Requer o banco de teste EXPLÍCITO:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/equipe/data/receipts-immutability.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  equipeAccounts,
  equipeItemVersions,
  equipeItems,
  equipeReceipts,
} from "@/server/db/equipe-schema";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? null;
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const TEST_DB_EXPLICITLY_CONFIGURED = TEST_DATABASE_URL !== null;

async function loadDb() {
  const [{ db }, schema] = await Promise.all([
    import("@/server/db"),
    import("@/server/db/schema"),
  ]);
  const { createPostgresEquipeUnitOfWork } = await import("./postgres");
  return { db, schema, createPostgresEquipeUnitOfWork };
}

const createdWorkspaceIds: string[] = [];

afterAll(async () => {
  if (!TEST_DB_EXPLICITLY_CONFIGURED) return;
  const { db, schema } = await loadDb();
  // Limpeza por CASCADE do workspace: versões e recibos caem junto (o
  // trigger permite DELETE via CASCADE e rejeita só o direto).
  for (const workspaceId of createdWorkspaceIds.splice(0)) {
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  }
});

// O drizzle embrulha o erro do driver: o texto do trigger vive no cause.
async function expectImmutable(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => null,
    (cause: unknown) => cause
  );
  expect(error).not.toBeNull();
  const texts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof Error) texts.push(current.message);
    if (typeof current !== "object") break;
    current = (current as { cause?: unknown }).cause;
  }
  expect(texts.join(" | ")).toMatch(/equipe_immutable/);
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)("imutabilidade no banco (0116)", () => {
  async function newScope() {
    const { db, schema, createPostgresEquipeUnitOfWork } = await loadDb();
    const uow = createPostgresEquipeUnitOfWork(db);
    const tag = `imrec-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const userId = `user-${tag}`;
    await db.insert(schema.user).values({
      id: userId,
      name: "Imutabilidade",
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
    const item = await uow.repos.items.create(scope, { frontId: front.id });
    return { db, schema, uow, scope, workspace, account, item };
  }

  async function seedVersionAndReceipt(scopeFixture: Awaited<ReturnType<typeof newScope>>) {
    const { uow, scope, item } = scopeFixture;
    const version = await uow.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash: "hash-1",
      authorRole: "agent",
    });
    const receipt = await uow.repos.receipts.create(scope, {
      personKind: "client_person",
      personRole: "approver",
      objectType: "item",
      objectId: item.id,
      objectVersion: "hash-1",
      action: "approve",
    });
    return { version, receipt };
  }

  it("UPDATE direto em recibo e versão falha no banco", async () => {
    const fixture = await newScope();
    const { db } = fixture;
    const { version, receipt } = await seedVersionAndReceipt(fixture);

    await expectImmutable(
      db.update(equipeReceipts).set({ action: "reject" }).where(eq(equipeReceipts.id, receipt.id))
    );
    await expectImmutable(
      db
        .update(equipeItemVersions)
        .set({ caption: "adulterada" })
        .where(eq(equipeItemVersions.id, version.id))
    );

    // As linhas seguem intactas depois das tentativas rejeitadas.
    expect((await fixture.uow.repos.receipts.get(fixture.scope, receipt.id))?.action).toBe(
      "approve"
    );
    expect(
      (await fixture.uow.repos.itemVersions.get(fixture.scope, version.id))?.caption
    ).toBe("");
  });

  it("DELETE direto em recibo e versão falha no banco", async () => {
    const fixture = await newScope();
    const { db } = fixture;
    const { version, receipt } = await seedVersionAndReceipt(fixture);

    await expectImmutable(db.delete(equipeReceipts).where(eq(equipeReceipts.id, receipt.id)));
    await expectImmutable(
      db.delete(equipeItemVersions).where(eq(equipeItemVersions.id, version.id))
    );

    // As linhas seguem intactas depois das tentativas rejeitadas.
    expect(await fixture.uow.repos.receipts.get(fixture.scope, receipt.id)).not.toBeNull();
    expect(await fixture.uow.repos.itemVersions.get(fixture.scope, version.id)).not.toBeNull();
  });

  it("excluir o workspace remove conta, itens, versões e recibos por CASCADE", async () => {
    const fixture = await newScope();
    const { db, schema, scope, workspace, item } = fixture;
    const { version, receipt } = await seedVersionAndReceipt(fixture);

    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspace.id));

    const remainingWorkspaces = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.id));
    expect(remainingWorkspaces).toHaveLength(0);
    expect(
      await db.select().from(equipeAccounts).where(eq(equipeAccounts.id, scope.accountId))
    ).toHaveLength(0);
    expect(await db.select().from(equipeItems).where(eq(equipeItems.id, item.id))).toHaveLength(
      0
    );
    expect(
      await db.select().from(equipeItemVersions).where(eq(equipeItemVersions.id, version.id))
    ).toHaveLength(0);
    expect(
      await db.select().from(equipeReceipts).where(eq(equipeReceipts.id, receipt.id))
    ).toHaveLength(0);
  });

  it("excluir a conta da Equipe remove itens, versões e recibos por CASCADE", async () => {
    const fixture = await newScope();
    const { db, schema, scope, workspace, item } = fixture;
    const { version, receipt } = await seedVersionAndReceipt(fixture);

    await db.delete(equipeAccounts).where(eq(equipeAccounts.id, scope.accountId));

    expect(
      await db.select().from(equipeAccounts).where(eq(equipeAccounts.id, scope.accountId))
    ).toHaveLength(0);
    expect(await db.select().from(equipeItems).where(eq(equipeItems.id, item.id))).toHaveLength(
      0
    );
    expect(
      await db.select().from(equipeItemVersions).where(eq(equipeItemVersions.id, version.id))
    ).toHaveLength(0);
    expect(
      await db.select().from(equipeReceipts).where(eq(equipeReceipts.id, receipt.id))
    ).toHaveLength(0);
    // O workspace sobrevive: só a conta da Equipe foi excluída.
    expect(
      await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspace.id))
    ).toHaveLength(1);
  });
});
