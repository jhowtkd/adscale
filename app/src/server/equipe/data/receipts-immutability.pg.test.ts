/**
 * Imutabilidade de recibos e versões no BANCO (trigger da 0116).
 *
 * Os repositórios não expõem update/delete nessas tabelas; ESTE teste prova
 * que mesmo um UPDATE/DELETE direto em SQL falha, com o erro do trigger.
 * A válvula `equipe.allow_immutable_write` (SET LOCAL por transação) existe
 * só para limpeza de testes e remoção do piloto — o app nunca a usa.
 *
 * Requer o banco de teste EXPLÍCITO:
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/equipe/data/receipts-immutability.pg.test.ts
 */
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { equipeItemVersions, equipeReceipts } from "@/server/db/equipe-schema";

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
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL equipe.allow_immutable_write = 'on'`);
    for (const workspaceId of createdWorkspaceIds.splice(0)) {
      await tx.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    }
  });
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
    return { db, schema, uow, scope, workspace, item };
  }

  it("UPDATE e DELETE em recibo falham no banco", async () => {
    const { db, uow, scope, item } = await newScope();
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

    await expectImmutable(
      db.update(equipeReceipts).set({ action: "reject" }).where(eq(equipeReceipts.id, receipt.id))
    );
    await expectImmutable(db.delete(equipeReceipts).where(eq(equipeReceipts.id, receipt.id)));
    await expectImmutable(
      db
        .update(equipeItemVersions)
        .set({ caption: "adulterada" })
        .where(eq(equipeItemVersions.id, version.id))
    );
    await expectImmutable(
      db.delete(equipeItemVersions).where(eq(equipeItemVersions.id, version.id))
    );

    // As linhas seguem intactas depois das tentativas rejeitadas.
    expect((await uow.repos.receipts.get(scope, receipt.id))?.action).toBe("approve");
    expect((await uow.repos.itemVersions.get(scope, version.id))?.caption).toBe("");
  });

  it("válvula de escape permite a limpeza explícita em transação", async () => {
    const { db, schema, uow, scope, workspace, item } = await newScope();
    await uow.repos.itemVersions.create(scope, {
      itemId: item.id,
      versionHash: "hash-1",
      authorRole: "agent",
    });
    await uow.repos.receipts.create(scope, {
      personKind: "client_person",
      personRole: "approver",
      objectType: "item",
      objectId: item.id,
      action: "approve",
    });
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL equipe.allow_immutable_write = 'on'`);
      await tx.delete(schema.workspaces).where(eq(schema.workspaces.id, workspace.id));
    });
    const remaining = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.id));
    expect(remaining).toHaveLength(0);
  });
});
