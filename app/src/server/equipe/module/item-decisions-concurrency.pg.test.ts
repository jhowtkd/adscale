import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { EquipeUnitOfWork } from "../data";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

type Fixture = Awaited<ReturnType<typeof createFixture>>;
let activeFixture: Fixture | null = null;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function createFixture() {
  if (!TEST_DATABASE_URL) throw new Error("Equipe Postgres test database is not configured");
  const [{ Pool }, { drizzle }, schema, equipeSchema, { createPostgresEquipeUnitOfWork },
    { makeTestDeps, seedStaff, testActors }, { executeCommand }, { ctx, deliverTestBatch }, publication,
    { seedMemoryAdscaleLabels }] = await Promise.all([
    import("pg"), import("drizzle-orm/node-postgres"), import("@/server/db/schema"),
    import("@/server/db/equipe-schema"), import("../data/postgres"),
    import("./testing/deps"), import("./commands"), import("./testing/items"),
    import("./testing/publication"), import("../data/memory"),
  ]);
  const poolA = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const poolB = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  const clientA = await poolA.connect();
  const clientB = await poolB.connect();
  const dbA = drizzle(clientA, { schema: { ...schema, ...equipeSchema } });
  const dbB = drizzle(clientB, { schema: { ...schema, ...equipeSchema } });
  const uowA = createPostgresEquipeUnitOfWork(dbA);
  const uowB = createPostgresEquipeUnitOfWork(dbB);
  const t = makeTestDeps();
  t.deps.uow = uowA;
  const workspaceId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const tag = `item-decision-${workspaceId}`;
  const userId = `decision-${workspaceId}`;
  await dbA.insert(schema.user).values({ id: userId, name: tag, email: `${userId}@example.test`, emailVerified: true });
  await dbA.insert(schema.workspaces).values({ id: workspaceId, name: tag, slug: tag });
  await dbA.insert(schema.clientProfiles).values({ id: profileId, workspaceId, name: tag });
  t.gateway.addProfile({ id: profileId, workspaceId, name: tag });
  seedMemoryAdscaleLabels(t.store, {
    workspaceId, profileId, brandName: "Marca concorrência", workspaceName: "Teste 592",
  });
  const operations = await seedStaff(t, "operations");
  const opened = await executeCommand(t.deps, { actor: operations, workspaceId }, {
    type: "open_account",
    payload: { clientProfileId: profileId, fronts: ["social_instagram", "midia_paga"], people: [
      { name: "Ana", role: "approver" }, { name: "Carla", role: "substitute" },
      { name: "Cid", role: "custodian" }, { name: "Rui", role: "member" },
    ] },
  });
  if (!opened.ok) throw new Error(`open_account failed: ${opened.error.code}`);
  const accountId = opened.value.accountId;
  const people = await uowA.repos.people.list({ workspaceId, accountId });
  const actor = (role: "approver" | "substitute" | "custodian" | "member") => {
    const person = people.find((row) => row.role === role);
    if (!person) throw new Error(`missing ${role} person`);
    return { kind: "client_person" as const, role, personId: person.id };
  };
  const support = await seedStaff(t, "support");
  const quality = await seedStaff(t, "quality");
  const ids = {
    workspaceId, accountId, profileId,
    actors: {
      approver: actor("approver"), substitute: actor("substitute"),
      custodian: actor("custodian"), member: actor("member"), operations, support, quality,
      agent: testActors.agent, system: testActors.system,
    },
  };
  // Auto mode needs a connected Instagram account (#595): approvals schedule and create intents.
  const { seedInstagramConnection } = publication;
  await seedInstagramConnection(t, ids);
  const second = {
    ...t,
    deps: { ...t.deps, uow: uowB },
  };
  const [pidA, pidB] = await Promise.all([
    clientA.query<{ pid: number }>("select pg_backend_pid() as pid"),
    clientB.query<{ pid: number }>("select pg_backend_pid() as pid"),
  ]);
  expect(pidA.rows[0]?.pid).not.toBe(pidB.rows[0]?.pid);
  return {
    poolA, poolB, clientA, clientB, dbA, dbB, schema, equipeSchema, t, second, ids, userId,
    ctx, deliverTestBatch, executeCommand, publication,
    pidA: pidA.rows[0]!.pid, pidB: pidB.rows[0]!.pid,
  };
}

function pauseAfterLockedItem(uow: EquipeUnitOfWork, itemId: string) {
  const entered = deferred();
  const proceed = deferred();
  let paused = false;
  const wrapped: EquipeUnitOfWork = {
    ...uow,
    run: (fn) => uow.run((repos, internal) => {
      const get = repos.items.get.bind(repos.items);
      const items = {
        ...repos.items,
        get: async (...args: Parameters<typeof get>) => {
          const item = await get(...args);
          if (!paused && args[1] === itemId && args[2]?.forUpdate) {
            paused = true;
            entered.resolve();
            await proceed.promise;
          }
          return item;
        },
      };
      return fn({ ...repos, items }, internal);
    }),
  };
  return { uow: wrapped, entered: entered.promise, proceed: proceed.resolve };
}

async function waitUntilBlocked(f: Fixture) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await f.clientA.query<{ wait_event_type: string | null; blockers: number[] }>(
      "select wait_event_type, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [f.pidB],
    );
    const row = result.rows[0];
    if (row?.wait_event_type === "Lock" && row.blockers.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("command did not wait on the other PostgreSQL connection's item lock");
}

async function deliver(f: Fixture, items: Array<{ scheduledFor?: Date }> = [{}]) {
  const inputs = [];
  for (const [index, item] of items.entries()) {
    const workId = crypto.randomUUID();
    const outputId = crypto.randomUUID();
    const tag = `${f.ids.workspaceId}-${index}-${workId}`;
    const [work] = await f.dbA.insert(f.schema.creativeWorkItems).values({
      id: workId, workspaceId: f.ids.workspaceId, clientProfileId: f.ids.profileId,
      createdByUserId: f.userId, title: "Teste #592", request: "saída determinística",
      toolKind: "variations", status: "ready", format: "4:5", settings: { targetFormats: [] },
    }).returning();
    const [output] = await f.dbA.insert(f.schema.creativeWorkOutputs).values({
      id: outputId, workspaceId: f.ids.workspaceId, workItemId: work.id,
      creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1,
      operationKey: tag, status: "completed", outputKey: `creative-work/${tag}/original.png`,
    }).returning();
    f.t.gateway.works.set(work.id, { id: work.id, workspaceId: f.ids.workspaceId });
    f.t.gateway.addOutput({ id: output.id, workspaceId: f.ids.workspaceId, workId: work.id });
    inputs.push({ workId: work.id, outputId: output.id, scheduledFor: item.scheduledFor });
  }
  return f.deliverTestBatch(f.t, f.ids, { items: inputs });
}

async function deliverApprovedDue(f: Fixture) {
  const scheduledFor = new Date("2026-10-05T13:55:00.000Z");
  const { itemIds, versionHashes } = await deliver(f, [{ scheduledFor }]);
  const oldClock = f.t.deps.clock;
  f.t.deps.clock = { now: () => new Date(scheduledFor.getTime() - 2 * 60 * 60 * 1000 - 1) };
  try {
    const approved = await f.executeCommand(f.t.deps, f.ctx(f.ids, f.ids.actors.approver), {
      type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    if (!approved.ok) throw new Error(`approve failed: ${approved.error.code}`);
  } finally {
    f.t.deps.clock = oldClock;
  }
  const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
  const intent = await f.t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!);
  if (!intent) throw new Error("approval did not create a publication intent");
  return { itemId: itemIds[0]!, versionHash: versionHashes[0]!, intentId: intent.id };
}

async function contend(
  f: Fixture,
  itemId: string,
  first: (deps: Fixture["t"]["deps"]) => Promise<unknown>,
  second: (deps: Fixture["second"]["deps"]) => Promise<unknown>,
) {
  const originalUow = f.t.deps.uow;
  const barrier = pauseAfterLockedItem(originalUow, itemId);
  f.t.deps.uow = barrier.uow;
  const firstResult = first(f.t.deps);
  await barrier.entered;
  const secondResult = second(f.second.deps);
  try {
    await waitUntilBlocked(f);
    barrier.proceed();
    return await Promise.all([firstResult, secondResult]);
  } finally {
    barrier.proceed();
    f.t.deps.uow = originalUow;
  }
}

afterEach(async () => {
  const f = activeFixture;
  activeFixture = null;
  if (!f) return;
  try {
    const stop = await f.t.deps.uow.internal.globalStops.getActive();
    if (stop) {
      await f.executeCommand(f.second.deps, { actor: f.ids.actors.operations, workspaceId: f.ids.workspaceId }, {
        type: "resume_all_publications", payload: { reason: "fim do teste" },
      });
    }
    await f.dbA.delete(f.schema.workspaces).where(eq(f.schema.workspaces.id, f.ids.workspaceId));
    await f.dbA.delete(f.schema.user).where(eq(f.schema.user.id, f.userId));
    for (const actor of [f.ids.actors.operations, f.ids.actors.support, f.ids.actors.quality]) {
      if (actor.kind === "staff") {
        await f.dbA.delete(f.equipeSchema.equipeStaff).where(eq(f.equipeSchema.equipeStaff.id, actor.staffId));
      }
    }
  } finally {
    f.clientA.release();
    f.clientB.release();
    await Promise.all([f.poolA.end(), f.poolB.end()]);
  }
});

describe.skipIf(!TEST_DATABASE_URL)("decisões concorrentes com conexões PostgreSQL independentes (#592)", () => {
  async function setup() {
    const f = await createFixture();
    activeFixture = f;
    return f;
  }

  it("aprovação ganha da recusa e a recusa ganha da aprovação", async () => {
    const f = await setup();
    const { itemIds, versionHashes } = await deliver(f);
    const [approved, refused] = await contend(
      f, itemIds[0]!,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
      }),
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "decline_publish", payload: { itemId: itemIds[0]!, reason: "fora do plano" },
      }),
    );
    expect(approved).toMatchObject({ ok: true });
    expect(refused).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
    const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
    expect((await f.t.deps.uow.repos.items.get(scope, itemIds[0]!))?.status).toBe("scheduled");
    expect(await f.t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(1);

    const second = await deliver(f);
    const [declined, staleApproval] = await contend(
      f, second.itemIds[0]!,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "decline_publish", payload: { itemId: second.itemIds[0]!, reason: "fora do plano" },
      }),
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "approve_item", payload: { itemId: second.itemIds[0]!, expectedVersionHash: second.versionHashes[0]! },
      }),
    );
    expect(declined).toMatchObject({ ok: true });
    expect(staleApproval).toMatchObject({ ok: false, error: { code: "invalid_transition" } });
    expect((await f.t.deps.uow.repos.items.get(scope, second.itemIds[0]!))?.status).toBe("do_not_publish");
    expect(await f.t.deps.uow.repos.intents.list(scope)).toHaveLength(1);
  });

  it("duas aprovações conservam um recibo e uma intent", async () => {
    const f = await setup();
    const { itemIds, versionHashes } = await deliver(f);
    const [first, second] = await contend(
      f, itemIds[0]!,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
      }),
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.substitute), {
        type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
      }),
    );
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true, value: { data: { alreadyApproved: true }, events: [] } });
    const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
    expect(await f.t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(1);
    expect(await f.t.deps.uow.repos.intents.list(scope)).toHaveLength(1);
  });

  it("edição que ganha torna a aprovação obsoleta; aprovação que ganha é substituída pela edição sequencial", async () => {
    const f = await setup();
    const { itemIds, versionHashes } = await deliver(f, [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }]);
    const [approved, edited] = await contend(
      f, itemIds[0]!,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
      }),
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "edit_caption", payload: { itemId: itemIds[0]!, caption: "edição após aprovação" },
      }),
    );
    expect(approved).toMatchObject({ ok: true });
    expect(edited).toMatchObject({ ok: true });
    const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
    const changedHash = (edited as { ok: true; value: { data: { versionHash: string } } }).value.data.versionHash;
    expect((await f.t.deps.uow.repos.items.get(scope, itemIds[0]!))).toMatchObject({ status: "adjusting", currentVersionHash: changedHash });
    expect((await f.t.deps.uow.repos.intents.getByItemVersion(scope, itemIds[0]!, versionHashes[0]!))?.status).toBe("canceled");

    const next = await deliver(f);
    const [editFirst, approvalSecond] = await contend(
      f, next.itemIds[0]!,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "edit_caption", payload: { itemId: next.itemIds[0]!, caption: "edição concorrente" },
      }),
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "approve_item", payload: { itemId: next.itemIds[0]!, expectedVersionHash: next.versionHashes[0]! },
      }),
    );
    expect(editFirst).toMatchObject({ ok: true });
    expect(approvalSecond).toMatchObject({ ok: false, error: { code: "version_mismatch" } });
  });

  it("cancelamento que ganha impede o dispatch de chamar o publisher", async () => {
    const f = await setup();
    await f.publication.approveLiveMandate(f.t, f.ids);
    const { itemId, versionHash, intentId } = await deliverApprovedDue(f);
    const [cancelled, dispatched] = await contend(
      f, itemId,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "cancel_scheduled", payload: { itemId },
      }),
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.system), {
        type: "dispatch_publication", payload: { intentId },
      }),
    );
    expect(cancelled).toMatchObject({ ok: true });
    expect(dispatched).toMatchObject({ ok: true, value: { data: { action: "none", intentStatus: "canceled" } } });
    expect(f.t.publisher.creates).toHaveLength(0);
    expect(f.t.publisher.publishes).toHaveLength(0);
    const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
    expect((await f.t.deps.uow.repos.items.get(scope, itemId))?.status).toBe("cancelled");
    expect((await f.t.deps.uow.repos.intents.getByItemVersion(scope, itemId, versionHash))?.status).toBe("canceled");
  });

  async function expectEditToWinHold(hold: "pause_publications" | "stop_all_publications") {
    const f = await setup();
    const { itemId } = await deliverApprovedDue(f);
    const holding = await contend(
      f, itemId,
      (deps) => f.executeCommand(deps, f.ctx(f.ids, f.ids.actors.approver), {
        type: "edit_caption", payload: { itemId, caption: `ajuste ${hold}` },
      }),
      (deps) => f.executeCommand(deps,
        hold === "stop_all_publications"
          ? { actor: f.ids.actors.operations, workspaceId: f.ids.workspaceId }
          : f.ctx(f.ids, f.ids.actors.approver),
        { type: hold, payload: hold === "stop_all_publications" ? { reason: "teste" } : {} },
      ),
    );
    expect(holding[0]).toMatchObject({ ok: true });
    expect(holding[1]).toMatchObject({ ok: true });
    const current = await f.t.deps.uow.repos.items.get(
      { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId }, itemId,
    );
    expect(current?.status).toBe("adjusting");
  }

  it("pausa relê o item e preserva adjusting após edição", async () => {
    await expectEditToWinHold("pause_publications");
  });

  it("parada global relê o item e preserva adjusting após edição", async () => {
    await expectEditToWinHold("stop_all_publications");
  });

  it("recusa aprovação no deadline exato e reavalia o relógio após esperar o lock", async () => {
    const f = await setup();
    const deadline = new Date("2026-10-09T10:00:00.000Z");
    const { itemIds, versionHashes } = await deliver(f, [{ scheduledFor: new Date("2026-10-09T12:00:00.000Z") }]);
    let now = new Date(deadline.getTime() - 1);
    f.t.deps.clock = { now: () => new Date(now) };
    f.second.deps.clock = f.t.deps.clock;
    await f.clientA.query("begin");
    await f.clientA.query("select id from adscale_equipe.equipe_items where id = $1 for update", [itemIds[0]]);
    const pending = f.executeCommand(f.second.deps, f.ctx(f.ids, f.ids.actors.approver), {
      type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    });
    try {
      await waitUntilBlocked(f);
      now = deadline;
    } finally {
      await f.clientA.query("commit");
    }
    const result = await pending;
    expect(result).toMatchObject({ ok: false, error: { code: "item_limit_passed" } });
    const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
    expect(await f.t.deps.uow.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(0);
    expect(await f.t.deps.uow.repos.intents.list(scope)).toHaveLength(0);
  });

  it("rollback de aprovação não deixa estado, recibo, intent ou evento parcial", async () => {
    const f = await setup();
    const { itemIds, versionHashes } = await deliver(f);
    const scope = { workspaceId: f.ids.workspaceId, accountId: f.ids.accountId };
    const beforeEvents = await f.t.deps.uow.repos.events.list(scope);
    const original = f.t.deps.uow;
    f.t.deps.uow = {
      ...original,
      run: (fn) => original.run((repos, internal) => {
        let writes = 0;
        const create = repos.events.create.bind(repos.events);
        const events = {
          ...repos.events,
          create: async (...args: Parameters<typeof create>) => {
            writes += 1;
            if (writes === 2) throw new Error("forced event rollback");
            return create(...args);
          },
        };
        return fn({ ...repos, events }, internal);
      }),
    };
    await expect(f.executeCommand(f.t.deps, f.ctx(f.ids, f.ids.actors.approver), {
      type: "approve_item", payload: { itemId: itemIds[0]!, expectedVersionHash: versionHashes[0]! },
    })).rejects.toThrow("forced event rollback");
    f.t.deps.uow = original;
    expect((await original.repos.items.get(scope, itemIds[0]!))?.status).toBe("awaiting_approval");
    expect(await original.repos.receipts.listByObject(scope, "item", itemIds[0]!)).toHaveLength(0);
    expect(await original.repos.intents.list(scope)).toHaveLength(0);
    expect(await original.repos.events.list(scope)).toEqual(beforeEvents);
  });
});
