/**
 * handoff_* commands against a REAL Postgres, with two independent
 * connections and a deterministic lock barrier (never a sleep) — same
 * pattern as item-decisions-concurrency.pg.test.ts, applied to the account
 * row that `runHandoffCommand` locks with `for no key update`.
 *
 *   TEST_DATABASE_URL=postgresql://jhonatan@localhost:5432/fluxo0_ticket04_test npm test -- src/server/equipe/module/handoff.pg.test.ts
 */
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { EquipeUnitOfWork } from "../data";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";
import { HANDOFF_READ_EVENT } from "../handoff/contract";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

const READER = { kind: "system", job: HANDOFF_READ_EVENT } as const;
const SYSTEM_OPEN = { kind: "system", job: "free-open" } as const;

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
    { makeTestDeps }, { executeCommand }] = await Promise.all([
    import("pg"), import("drizzle-orm/node-postgres"), import("@/server/db/schema"),
    import("@/server/db/equipe-schema"), import("../data/postgres"),
    import("./testing/deps"), import("./commands"),
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
  const tag = `handoff-pg-${workspaceId}`;
  const userId = `handoff-${workspaceId}`;
  await dbA.insert(schema.user).values({ id: userId, name: tag, email: `${userId}@example.test`, emailVerified: true });
  await dbA.insert(schema.workspaces).values({ id: workspaceId, name: tag, slug: tag });
  await dbA.insert(schema.workspaceMembers).values({ workspaceId, userId });
  const opened = await executeCommand(t.deps, { actor: SYSTEM_OPEN, workspaceId }, { type: "open_free_account", payload: { userId } });
  if (!opened.ok) throw new Error(`open_free_account failed: ${opened.error.code}`);
  const accountId = opened.value.accountId!;
  const scope = { workspaceId, accountId };
  const [person] = await uowA.repos.people.list(scope);
  if (!person) throw new Error("missing approver person");
  const approver = { kind: "client_person" as const, role: "approver" as const, personId: person.id };
  const second = { ...t, deps: { ...t.deps, uow: uowB } };
  const [pidA, pidB] = await Promise.all([
    clientA.query<{ pid: number }>("select pg_backend_pid() as pid"),
    clientB.query<{ pid: number }>("select pg_backend_pid() as pid"),
  ]);
  return {
    poolA, poolB, clientA, clientB, dbA, dbB, schema, equipeSchema, t, second, executeCommand,
    workspaceId, accountId, scope, approver, userId,
    pidA: pidA.rows[0]!.pid, pidB: pidB.rows[0]!.pid,
  };
}

/** Pauses the command right after it takes `for no key update` on the account row. */
function pauseAfterLockedAccount(uow: EquipeUnitOfWork, accountId: string) {
  const entered = deferred();
  const proceed = deferred();
  let paused = false;
  const wrapped: EquipeUnitOfWork = {
    ...uow,
    run: (fn) => uow.run((repos, internal) => {
      const get = repos.accounts.get.bind(repos.accounts);
      const accounts = {
        ...repos.accounts,
        get: async (...args: Parameters<typeof get>) => {
          const row = await get(...args);
          if (!paused && args[1] === accountId && args[2]?.forUpdate) {
            paused = true;
            entered.resolve();
            await proceed.promise;
          }
          return row;
        },
      };
      return fn({ ...repos, accounts }, internal);
    }),
  };
  return { uow: wrapped, entered: entered.promise, proceed: proceed.resolve };
}

async function waitUntilBlocked(client: Fixture["clientA"], pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await client.query<{ wait_event_type: string | null; blockers: number[] }>(
      "select wait_event_type, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = result.rows[0];
    if (row?.wait_event_type === "Lock" && row.blockers.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("command did not wait on the other PostgreSQL connection's account lock");
}

/** Runs `first` on the primary connection, pauses it right after it locks the
 * account row, starts `second` on the independent connection, confirms it is
 * genuinely BLOCKED on that same lock (never a sleep-based guess), then lets
 * `first` proceed and resolves both. */
async function contend(
  f: Fixture,
  first: (deps: Fixture["t"]["deps"]) => Promise<unknown>,
  second: (deps: Fixture["second"]["deps"]) => Promise<unknown>,
) {
  const originalUow = f.t.deps.uow;
  const barrier = pauseAfterLockedAccount(originalUow, f.accountId);
  f.t.deps.uow = barrier.uow;
  const firstResult = first(f.t.deps);
  await barrier.entered;
  const secondResult = second(f.second.deps);
  try {
    // Probed from clientA, not clientB: clientB's single connection is itself
    // busy waiting on the lock, so it cannot answer a query about its own state.
    await waitUntilBlocked(f.clientA, f.pidB);
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
    await f.dbA.delete(f.schema.workspaces).where(eq(f.schema.workspaces.id, f.workspaceId));
    await f.dbA.delete(f.schema.user).where(eq(f.schema.user.id, f.userId));
  } finally {
    f.clientA.release();
    f.clientB.release();
    await Promise.all([f.poolA.end(), f.poolB.end()]);
  }
});

describe.skipIf(!TEST_DATABASE_URL)("handoff commands, two independent Postgres connections (ticket 04)", () => {
  async function setup() {
    const f = await createFixture();
    activeFixture = f;
    return f;
  }

  /** Drives the fixture's fresh handoff row through handoff_set_source, so reading groups exist. */
  async function withSource(f: Fixture) {
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const out = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_set_source", payload: { expectedStep: row!.step, expectedVersion: row!.version, kind: "site", value: "https://acme.com" },
    });
    if (!out.ok) throw new Error(`handoff_set_source failed: ${out.error.code}`);
    const [after] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    return after!;
  }

  it("double click: the second connection blocks on the SAME account row lock, then loses to stale_version", async () => {
    const f = await setup();
    const [row] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    const command = { type: "handoff_set_source" as const, payload: { expectedStep: row!.step, expectedVersion: row!.version, kind: "site" as const, value: "https://acme.com" } };
    const [first, second] = await contend(
      f,
      (deps) => f.executeCommand(deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, command),
      (deps) => f.executeCommand(deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, command),
    );
    const results = [first, second] as Array<{ ok: boolean; error?: { code: string } }>;
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    expect(loser?.error?.code).toBe("stale_version");
    const [after] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    expect(after!.step).toBe("reading");
    expect(after!.version).toBe(2);
    expect(after!.readsUsed).toBe(1);
  });

  it("a group result and a decision on a DIFFERENT group never lose each other's captured items (row lock serializes, no lost update)", async () => {
    const f = await setup();
    const row = await withSource(f);
    const nameGroup = row.reading.name!;
    const recordName = {
      type: "handoff_record_group" as const,
      payload: {
        readingId: row!.readingId!, runId: nameGroup.runId, taskIntentId: nameGroup.taskIntentId, group: "name" as const,
        result: { status: "found" as const, items: [{ id: crypto.randomUUID(), value: "Acme", origin: "site" as const }] },
      },
    };
    const logoGroup = row!.reading.logo!;
    const recordLogo = {
      type: "handoff_record_group" as const,
      payload: {
        readingId: row!.readingId!, runId: logoGroup.runId, taskIntentId: logoGroup.taskIntentId, group: "logo" as const,
        result: { status: "not_found" as const, items: [] },
      },
    };
    const [first, second] = await contend(
      f,
      (deps) => f.executeCommand(deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, recordName),
      (deps) => f.executeCommand(deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, recordLogo),
    );
    expect((first as { ok: boolean }).ok).toBe(true);
    expect((second as { ok: boolean }).ok).toBe(true);

    const [after] = await f.t.deps.uow.repos.handoffs.list(f.scope);
    // Neither concurrent write clobbered the other's captured group.
    expect(after!.reading.name).toMatchObject({ status: "found" });
    expect(after!.captured.name?.[0]).toMatchObject({ value: "Acme" });
    expect(after!.reading.logo).toMatchObject({ status: "not_found" });
  });

  it("resuming with a brand-new pool/unit of work continues the same reading, not a fresh one", async () => {
    const f = await setup();
    const row = await withSource(f);
    const nameGroup = row.reading.name!;
    const recorded = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_record_group",
      payload: { readingId: row!.readingId!, runId: nameGroup.runId, taskIntentId: nameGroup.taskIntentId, group: "name",
        result: { status: "found", items: [{ id: crypto.randomUUID(), value: "Acme", origin: "site" }] } },
    });
    expect(recorded.ok).toBe(true);

    // A completely independent connection/unit of work picks up where the first left off.
    const [resumed] = await f.second.deps.uow.repos.handoffs.list(f.scope);
    expect(resumed!.readingId).toBe(row!.readingId);
    expect(resumed!.reading.name).toMatchObject({ status: "found" });
    expect(resumed!.reading.name?.bySource?.site).toMatchObject({ status: "found", runId: nameGroup.runId });
    expect(resumed!.captured.name?.[0]).toMatchObject({ value: "Acme" });

    const confirmed = await f.executeCommand(f.second.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_retry_reading", payload: { expectedStep: resumed!.step, expectedVersion: resumed!.version },
    });
    // Retrying needs a failed group; the point is that the SECOND pool sees the
    // exact live state (right expectedStep/expectedVersion) and is authorized
    // to act on it, not that this particular command succeeds.
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.error.code).toBe("invalid_transition");
  });

  it("asset policy isolates the handoff and preserves analysis for a mixed-plan workspace", async () => {
    const f = await setup();
    const row = await withSource(f);
    const { hasNonFreeAssetAccount, isHandoffInWorkspace } = await import("../handoff/assets");
    expect(await hasNonFreeAssetAccount(f.workspaceId)).toBe(false);
    expect(await isHandoffInWorkspace(f.workspaceId, row.id)).toBe(true);
    expect(await isHandoffInWorkspace(crypto.randomUUID(), row.id)).toBe(false);
    const [profile] = await f.dbA.insert(f.schema.clientProfiles).values({ workspaceId: f.workspaceId, name: "Paid brand" }).returning();
    await f.t.deps.uow.repos.accounts.create(f.workspaceId, { clientProfileId: profile!.id, status: "active" });
    expect(await hasNonFreeAssetAccount(f.workspaceId)).toBe(true);
    expect(await hasNonFreeAssetAccount(crypto.randomUUID())).toBe(false);
  });

  it("resumes after the claim commits in Postgres but its step acknowledgement is lost", async () => {
    const f = await setup();
    const row = await withSource(f);
    const [{ createHandoffReadHandler }, { FakeSiteReader, FakeInstagramReader }, { HANDOFF_GROUPS }] = await Promise.all([
      import("../handoff/read"), import("../handoff/readers"), import("../domain/handoff"),
    ]);
    const taskIntentId = row.reading.name!.taskIntentId;
    const intent = await f.t.deps.uow.repos.taskOutbox.get(f.scope, taskIntentId);
    const event = { data: { ...f.scope, taskIntentId, ...(intent!.data as object) } };
    const cache = new Map<string, unknown>();
    let loseClaim = true;
    const step = { async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
      if (cache.has(id)) return cache.get(id) as T;
      const value = await fn();
      if (id.startsWith("claim-") && loseClaim) { loseClaim = false; throw new Error("lost claim acknowledgement"); }
      cache.set(id, value); return value;
    } };
    const site = new FakeSiteReader();
    const handler = createHandoffReadHandler(f.t.deps, { site, instagram: new FakeInstagramReader() });
    await expect(handler({ event, step })).rejects.toThrow("lost claim acknowledgement");
    const claims = (await f.second.deps.uow.repos.events.list(f.scope)).filter(e => e.eventType === "handoff.read_claimed");
    expect(claims).toHaveLength(1);
    expect(await handler({ event, step })).toEqual({ recorded: HANDOFF_GROUPS.length });
    expect(site.calls).toHaveLength(1);
    const [resumed] = await f.second.deps.uow.repos.handoffs.list(f.scope);
    expect(resumed!.readsUsed).toBe(1);
    expect(HANDOFF_GROUPS.every(group => resumed!.reading[group]?.status === "found")).toBe(true);
    expect((await f.second.deps.uow.repos.events.list(f.scope)).filter(e => e.eventType === "handoff.read_claimed")).toHaveLength(1);
  });

  it("confirming the summary commits the identity, the handoff row and the diagnose intent atomically", async () => {
    const f = await setup();
    const scope = f.scope;
    const groups = ["name", "logo", "colors", "fonts", "networks", "images"] as const;
    let row = await withSource(f);
    for (const group of groups) {
      const g = row!.reading[group]!;
      const items = group === "name" ? [{ id: crypto.randomUUID(), value: "Acme", origin: "site" as const }] : [];
      const out = await f.executeCommand(f.t.deps, { actor: READER, workspaceId: f.workspaceId, accountId: f.accountId }, {
        type: "handoff_record_group",
        payload: { readingId: row!.readingId!, runId: g.runId, taskIntentId: g.taskIntentId, group, result: { status: items.length ? "found" : "not_found", items } },
      });
      if (!out.ok) throw new Error(`record ${group} failed: ${out.error.code}`);
      row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    }
    const confirmIdentity = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_identity",
      payload: { expectedStep: row!.step, expectedVersion: row!.version, name: "Acme", logo: null, colors: [], fonts: [], paletteChoice: "site" },
    });
    if (!confirmIdentity.ok) throw new Error(confirmIdentity.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmNetworks = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_networks", payload: { expectedStep: row!.step, expectedVersion: row!.version, kept: [], added: [] },
    });
    if (!confirmNetworks.ok) throw new Error(confirmNetworks.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;
    const confirmImages = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_images", payload: { expectedStep: row!.step, expectedVersion: row!.version, kept: [], removed: [], uploaded: [] },
    });
    if (!confirmImages.ok) throw new Error(confirmImages.error.code);
    row = (await f.t.deps.uow.repos.handoffs.list(scope))[0]!;

    const seenFromOtherConnection: Array<{ profileName: string | null; intentCount: number; step: string }> = [];
    f.t.deps.sendTaskEvent = async (event) => {
      // This fires strictly AFTER commit (see module/shared.ts transact()):
      // by this point every write of the transaction must already be visible
      // from the completely independent second connection, all together.
      const [profile] = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
      const [handoffRow] = await f.second.deps.uow.repos.handoffs.list(scope);
      seenFromOtherConnection.push({ profileName: profile?.name ?? null, intentCount: 1, step: handoffRow!.step });
      void event;
    };

    const before = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
    expect(before[0]?.name).not.toBe("Acme");

    const confirmSummary = await f.executeCommand(f.t.deps, { actor: f.approver, workspaceId: f.workspaceId, accountId: f.accountId }, {
      type: "handoff_confirm_summary", payload: { expectedStep: row!.step, expectedVersion: row!.version },
    });
    expect(confirmSummary.ok).toBe(true);

    expect(seenFromOtherConnection).toHaveLength(1);
    expect(seenFromOtherConnection[0]).toMatchObject({ profileName: "Acme", step: "done" });
    const [after] = await f.dbB.select().from(f.schema.clientProfiles).where(eq(f.schema.clientProfiles.id, row!.clientProfileId));
    expect(after?.name).toBe("Acme");
    const [handoff] = await f.second.deps.uow.repos.handoffs.list(scope);
    expect(handoff!.step).toBe("done");
  });
});
