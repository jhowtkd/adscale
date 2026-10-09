import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

const workspaceIds: string[] = [];

async function loadDb() {
  const [{ db }, schema, [{ createPostgresEquipeUnitOfWork }, { executeCommand }, domain, { FakeAdscaleGateway }]] =
    await Promise.all([
      import("../../db"),
      import("../../db/schema"),
      Promise.all([
        import("../data/postgres"),
        import("./commands"),
        import("../domain"),
        import("./testing/fakes"),
      ]),
    ]);
  return { db, schema, createPostgresEquipeUnitOfWork, executeCommand, domain, FakeAdscaleGateway };
}

afterAll(async () => {
  if (!TEST_DATABASE_URL) return;
  const { db, schema } = await loadDb();
  for (const workspaceId of workspaceIds.splice(0)) {
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  }
});

describe.skipIf(!TEST_DATABASE_URL)("reconcile concorrente no Postgres (#594)", () => {
  it.each([true, false])("serializa o resultado concorrente após 1 h (lookup falha: %s)", async (lookupFails) => {
    const { db, schema, createPostgresEquipeUnitOfWork, executeCommand, domain, FakeAdscaleGateway } = await loadDb();
    const uow = createPostgresEquipeUnitOfWork(db);
    const tag = `reconcile-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const [workspace] = await db.insert(schema.workspaces).values({ name: tag, slug: tag }).returning();
    workspaceIds.push(workspace.id);
    const [profile] = await db.insert(schema.clientProfiles).values({ workspaceId: workspace.id, name: tag }).returning();
    const account = await uow.repos.accounts.create(workspace.id, { clientProfileId: profile.id });
    const scope = { workspaceId: workspace.id, accountId: account.id };
    const front = await uow.repos.fronts.create(scope, { key: "social_instagram" });
    const now = new Date("2026-10-05T14:00:00.000Z");
    const scheduledFor = new Date("2026-10-05T13:00:00.000Z");
    const item = await uow.repos.items.create(scope, {
      frontId: front.id, status: "verifying", scheduledFor, destination: "instagram:@brand",
    });
    const versionHash = `pg-${crypto.randomUUID()}`;
    await uow.repos.itemVersions.create(scope, {
      itemId: item.id, versionHash, authorRole: "agent", caption: "unconfirmed", scheduledFor,
      destination: "instagram:@brand", destinationIgUserId: "ig-pg",
    });
    await uow.repos.items.update(scope, item.id, { currentVersionHash: versionHash });
    const { intent } = await uow.repos.intents.insertOrGet(scope, {
      itemId: item.id, versionHash, status: "verifying", scheduledFor,
      destinationIgUserId: "ig-pg", containerId: "container-pg",
      externalId: lookupFails ? null : "acknowledged-media",
    });
    await uow.repos.events.create(scope, {
      actorType: "system", actorId: "dispatch", actorRole: "system",
      eventType: "item.uncertain", objectType: "item", objectId: item.id,
      payload: { step: "publish", containerId: "container-pg" },
      occurredAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    });

    let lookupCount = 0;
    let releaseLookups!: () => void;
    const bothLookups = new Promise<void>((resolve) => { releaseLookups = resolve; });
    let sendCalls = 0;
    const deps = {
      uow,
      clock: domain.fixedClock(now),
      gateway: new FakeAdscaleGateway(),
      publisher: {
        findRecentMedia: async () => {
          lookupCount += 1;
          if (lookupCount === 2) releaseLookups();
          await bothLookups;
          if (lookupFails) throw new Error("simulated provider lookup failure");
          return [{ externalId: "acknowledged-media", igUserId: "ig-pg", caption: null, permalink: null, takenAt: null }];
        },
        createContainer: async () => { sendCalls += 1; throw new Error("must not send"); },
        publishContainer: async () => { sendCalls += 1; throw new Error("must not send"); },
        deleteMedia: async () => ({ deleted: false }),
      },
    };
    const context = {
      actor: { kind: "system" as const, job: "reconcile-pg" },
      workspaceId: scope.workspaceId,
      accountId: scope.accountId,
    };
    const run = () => executeCommand(deps, context, {
      type: "reconcile_publication", payload: { itemId: item.id },
    });
    const outcomes = await Promise.all([run(), run()]);
    expect(outcomes).toMatchObject([{ ok: true }, { ok: true }]);
    expect(lookupCount).toBe(2);
    expect(sendCalls).toBe(0);

    const storedItem = await uow.repos.items.get(scope, item.id);
    const storedIntent = await uow.repos.intents.get(scope, intent.id);
    if (!lookupFails) {
      expect(storedItem?.status).toBe("published");
      expect(storedIntent).toMatchObject({ status: "published", externalId: "acknowledged-media" });
      const receipts = await uow.repos.receipts.listByObject(scope, "item", item.id);
      expect(receipts.filter((receipt) => receipt.action === "dispatch_publication")).toHaveLength(1);
      expect(await uow.repos.events.list(scope, { eventType: "item.published", objectId: item.id })).toHaveLength(1);
      expect(await uow.repos.escalations.list(scope)).toHaveLength(0);
      return;
    }
    expect(storedItem?.status).toBe("verifying");
    expect(storedIntent).toMatchObject({ status: "verifying", lastError: "lookup_failed" });
    const escalations = await uow.repos.escalations.list(scope);
    expect(escalations).toHaveLength(1);
    expect(escalations[0]).toMatchObject({ kind: "technical", itemId: item.id, status: "open" });
    expect(await uow.repos.events.list(scope, {
      eventType: "item.reconcile_escalated", objectId: intent.id,
    })).toHaveLength(1);
    expect((await uow.repos.events.list(scope, { eventType: "notification.requested" }))).toHaveLength(1);

    await uow.repos.escalations.update(scope, escalations[0]!.id, {
      status: "resolved", resolvedAt: now,
    });
    await run();
    expect(await uow.repos.escalations.list(scope)).toMatchObject([
      expect.objectContaining({ id: escalations[0]!.id, status: "resolved" }),
    ]);
    expect(await uow.repos.events.list(scope, {
      eventType: "item.reconcile_escalated", objectId: intent.id,
    })).toHaveLength(1);
    expect(await uow.repos.events.list(scope, { eventType: "notification.requested" })).toHaveLength(1);
    expect(sendCalls).toBe(0);
  });
});
