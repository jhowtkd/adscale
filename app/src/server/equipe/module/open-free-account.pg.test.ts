/**
 * open_free_account + outbox contra Postgres REAL, com DOIS pools independentes
 * (dois "processos") e barreira determinística por pg_locks — nada de sleep
 * como prova de bloqueio.
 *
 *   TEST_DATABASE_URL=postgres://test:test@localhost:55433/fluxo0_ticket01_test npm test -- src/server/equipe/module/open-free-account.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, commands, shared, taskOutbox, schema, equipeSchema, outbox] = await Promise.all([
    import("./testing/free-pg"), import("./commands"), import("./shared"), import("./task-outbox"),
    import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("../jobs/agent-work-outbox"),
  ]);
  return { free, commands, shared, taskOutbox, schema, equipeSchema, outbox };
}

const SYSTEM = { kind: "system", job: "free-open" } as const;

describe.skipIf(!ENABLED)("open_free_account (pg, dois pools)", () => {
  let m: Mods; let A: ReturnType<Mods["free"]["openPool"]>; let B: ReturnType<Mods["free"]["openPool"]>;
  const workspaces: string[] = []; const users: string[] = [];

  beforeAll(async () => {
    m = await load();
    A = m.free.openPool(TEST_DATABASE_URL!); B = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(A, TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(B, TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    if (!ENABLED) return;
    await m.free.cleanup(A, workspaces, users);
    await A.pool.end(); await B.pool.end();
  });

  async function seed(options?: { verified?: boolean; member?: boolean }) {
    const seeded = await m.free.seedWorkspace(A, options);
    workspaces.push(seeded.workspaceId); users.push(seeded.userId);
    return seeded;
  }
  const open = (h: typeof A, workspaceId: string, userId: string, extra = {}) =>
    m.commands.executeCommand(m.free.depsFor(h, undefined, extra), { actor: SYSTEM, workspaceId },
      { type: "open_free_account", payload: { userId } });
  const lockKey = (workspaceId: string) => `equipe-free:${workspaceId}`;

  async function counts(workspaceId: string) {
    const q = async (table: string) => (await A.db.execute(sql.raw(`select count(*)::int n from ${table} where workspace_id = '${workspaceId}'`))).rows[0] as { n: number };
    return {
      accounts: (await q("adscale_equipe.equipe_accounts")).n,
      profiles: (await q("adscale_app.client_profiles")).n,
      people: (await q("adscale_equipe.equipe_account_people")).n,
      handoffs: (await q("adscale_equipe.equipe_brand_handoffs")).n,
    };
  }

  it("creates brand, free account, approver, thread and source handoff in the real schema", async () => {
    const { workspaceId, userId } = await seed();
    const out = await open(A, workspaceId, userId);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const uow = m.free.depsFor(A).uow;
    const account = await uow.repos.accounts.get(workspaceId, out.value.accountId!);
    expect(account?.status).toBe("free");
    const [profile] = await A.db.select().from(m.schema.clientProfiles).where(eq(m.schema.clientProfiles.id, account!.clientProfileId));
    expect(profile).toMatchObject({ name: "Minha marca", workspaceId });
    const scope = { workspaceId, accountId: account!.id };
    expect(await uow.repos.people.list(scope)).toEqual([expect.objectContaining({ userId, role: "approver", name: "Ana Free" })]);
    expect(await uow.repos.handoffs.list(scope)).toEqual([expect.objectContaining({ step: "source", clientProfileId: profile!.id })]);
    expect(await uow.repos.threads.list(scope)).toEqual([expect.objectContaining({ kind: "primary" })]);
    expect(await counts(workspaceId)).toEqual({ accounts: 1, profiles: 1, people: 1, handoffs: 1 });
  });

  it("the workspace advisory lock really BLOCKS a concurrent opening from another pool until released", async () => {
    const { workspaceId, userId } = await seed();
    const holder = await B.pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey(workspaceId)]);
      let settled = false;
      const pending = open(A, workspaceId, userId).then((r) => { settled = true; return r; });
      await m.free.waitUntil(async () => (await m.free.waitingOnAdvisoryKey(A, lockKey(workspaceId))) === 1, "opening waiting on the lock");
      expect(settled).toBe(false);
      expect(await counts(workspaceId)).toEqual({ accounts: 0, profiles: 0, people: 0, handoffs: 0 });
      await holder.query("commit");
      const out = await pending;
      expect(out.ok).toBe(true);
    } finally { holder.release(); }
  });

  it("two simultaneous openings (two pools, both parked at the lock) create exactly ONE account", async () => {
    const { workspaceId, userId } = await seed();
    const holder = await B.pool.connect();
    let outcomes: Array<Awaited<ReturnType<typeof open>>>;
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey(workspaceId)]);
      const runs = [open(A, workspaceId, userId), open(B, workspaceId, userId)];
      // Barrier: BOTH commands are inside their transaction, blocked on the same lock.
      await m.free.waitUntil(async () => (await m.free.waitingOnAdvisoryKey(A, lockKey(workspaceId))) === 2, "both openings waiting");
      await holder.query("commit");
      outcomes = await Promise.all(runs);
    } finally { holder.release(); }
    expect(outcomes.every((o) => o.ok)).toBe(true);
    const created = outcomes.map((o) => (o.ok ? (o.value.data as { created: boolean }).created : null)).sort();
    expect(created).toEqual([false, true]);
    const ids = new Set(outcomes.map((o) => (o.ok ? o.value.accountId : "")));
    expect(ids.size).toBe(1);
    expect(await counts(workspaceId)).toEqual({ accounts: 1, profiles: 1, people: 1, handoffs: 1 });
    const threads = await A.db.execute(sql`select count(*)::int n from adscale_equipe.equipe_threads where workspace_id = ${workspaceId}`);
    expect((threads.rows[0] as { n: number }).n).toBe(1);
  });

  it("many parallel openings across pools still yield one account", async () => {
    const { workspaceId, userId } = await seed();
    const outs = await Promise.all(Array.from({ length: 8 }, (_, i) => open(i % 2 ? A : B, workspaceId, userId)));
    expect(outs.every((o) => o.ok)).toBe(true);
    expect(await counts(workspaceId)).toEqual({ accounts: 1, profiles: 1, people: 1, handoffs: 1 });
  });

  it("locks per workspace: another workspace is NOT blocked by a held lock", async () => {
    const one = await seed(); const two = await seed();
    const holder = await B.pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey(one.workspaceId)]);
      const out = await open(A, two.workspaceId, two.userId);
      expect(out.ok).toBe(true);
      await holder.query("commit");
    } finally { holder.release(); }
  });

  it("refuses unverified users, non-members and users of another workspace, creating nothing (rolled back)", async () => {
    const unverified = await seed({ verified: false });
    const stranger = await seed({ member: false });
    const other = await seed();
    for (const [ws, uid] of [[unverified.workspaceId, unverified.userId], [stranger.workspaceId, stranger.userId], [unverified.workspaceId, other.userId], [other.workspaceId, "ghost"]] as const) {
      const out = await open(A, ws, uid);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("forbidden_actor");
    }
    for (const ws of [unverified.workspaceId, stranger.workspaceId]) {
      expect(await counts(ws)).toEqual({ accounts: 0, profiles: 0, people: 0, handoffs: 0 });
    }
  });

  it("returns an existing paid account untouched", async () => {
    const { workspaceId, userId } = await seed();
    const [profile] = await A.db.insert(m.schema.clientProfiles).values({ workspaceId, name: "Paga" }).returning();
    const paid = await m.free.depsFor(A).uow.repos.accounts.create(workspaceId, { clientProfileId: profile!.id });
    const out = await open(B, workspaceId, userId);
    expect(out.ok && out.value.accountId).toBe(paid.id);
    expect((await counts(workspaceId))).toMatchObject({ accounts: 1, profiles: 1, people: 0, handoffs: 0 });
    expect((await m.free.depsFor(A).uow.repos.accounts.get(workspaceId, paid.id))?.status).toBe("deploying");
  });

  it("the DB rejects a status outside the allowed list (free is allowed, junk is not)", async () => {
    const { workspaceId, userId } = await seed();
    const out = await open(A, workspaceId, userId);
    if (!out.ok) throw new Error("open failed");
    await expect(A.db.execute(sql`update adscale_equipe.equipe_accounts set status = 'trial' where id = ${out.value.accountId}`)).rejects.toThrow();
  });

  describe("task outbox", () => {
    async function freeAccount() {
      const { workspaceId, userId } = await seed();
      const out = await open(A, workspaceId, userId);
      if (!out.ok) throw new Error("open failed");
      return { workspaceId, accountId: out.value.accountId! };
    }
    const request = (h: typeof A, a: { workspaceId: string; accountId: string }, opts: { fail?: boolean; send?: (e: never) => Promise<unknown> } = {}) =>
      m.shared.transact(m.free.depsFor(h, undefined, opts.send ? { sendTaskEvent: opts.send as never } : {}),
        { actor: SYSTEM, workspaceId: a.workspaceId, accountId: a.accountId, type: "ensure_primary_thread" } as never, async (ctx) => {
          await m.taskOutbox.requestTask(ctx, { eventName: "equipe.diag", data: { n: 1 } });
          return opts.fail ? { ok: false, error: { code: "boom", message: "x" } } as never : { ok: true, value: null } as never;
        });
    const intents = (a: { workspaceId: string; accountId: string }) =>
      A.db.select().from(m.equipeSchema.equipeTaskOutbox).where(eq(m.equipeSchema.equipeTaskOutbox.accountId, a.accountId));
    const taskEvents = (a: { workspaceId: string; accountId: string }) =>
      A.db.select().from(m.equipeSchema.equipeEvents).where(and(eq(m.equipeSchema.equipeEvents.accountId, a.accountId), eq(m.equipeSchema.equipeEvents.eventType, "task.requested")));

    it("persists event + intent in the SAME transaction, sends after commit with the intent id, then marks dispatched", async () => {
      const a = await freeAccount();
      const sent: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
      const out = await request(A, a, { send: async (e) => {
        // At send time the command is already COMMITTED and visible from another pool.
        const seen = await B.db.select().from(m.equipeSchema.equipeTaskOutbox).where(eq(m.equipeSchema.equipeTaskOutbox.accountId, a.accountId));
        expect(seen).toHaveLength(1);
        sent.push(e as never);
      } });
      expect(out.ok).toBe(true);
      const [intent] = await intents(a); const [event] = await taskEvents(a);
      expect(intent!.id).toBe(event!.id);
      expect(intent!.dispatchedAt).toBeInstanceOf(Date);
      expect(sent).toEqual([{ id: intent!.id, name: "equipe.diag", data: { n: 1, workspaceId: a.workspaceId, accountId: a.accountId, taskIntentId: intent!.id } }]);
    });

    it("rolls back BOTH rows when the command fails, and sends nothing", async () => {
      const a = await freeAccount();
      const sent: unknown[] = [];
      const out = await request(A, a, { fail: true, send: async (e) => { sent.push(e); } });
      expect(out.ok).toBe(false);
      expect(await intents(a)).toEqual([]);
      expect(await taskEvents(a)).toEqual([]);
      expect(sent).toEqual([]);
    });

    it("send failure keeps the committed intent pending; the reconciler dispatches it with the same id", async () => {
      const a = await freeAccount();
      const out = await request(A, a, { send: async () => { throw new Error("inngest down"); } });
      expect(out.ok).toBe(true);
      const [pending] = await intents(a);
      expect(pending!.dispatchedAt).toBeNull();
      const sent: Array<{ id: string; name: string; data: Record<string, unknown> }> = [];
      const handler = m.outbox.createAgentWorkOutboxHandler({ uow: m.free.depsFor(B).uow, clock: m.free.depsFor(B).clock,
        isEnabledForWorkspace: (w: string) => w === a.workspaceId, gatewayFor: () => m.free.depsFor(B).gateway } as never);
      const step = { run: async <T>(_n: string, fn: () => Promise<T>) => fn(),
        sendEvent: async (_n: string, e: never) => { sent.push(e); } };
      await handler({ step: step as never });
      expect(sent.map((e) => e.id)).toEqual([pending!.id]);
      expect((await intents(a))[0]!.dispatchedAt).toBeInstanceOf(Date);
      await handler({ step: step as never });
      expect(sent).toHaveLength(1);
    });

    it("the pending queue is a partial index over undispatched rows only; history is never scanned", async () => {
      const idx = await A.db.execute(sql`select indexdef from pg_indexes where indexname = 'equipe_task_outbox_pending_idx'`);
      expect((idx.rows[0] as { indexdef: string }).indexdef.toLowerCase()).toMatch(/dispatched_at is null/);
      const a = await freeAccount();
      await request(A, a, { send: async () => {} });   // dispatched → out of the queue
      const pendingIds = (await m.free.depsFor(A).uow.internal.listPendingTaskIntents()).map((p) => p.accountId);
      expect(pendingIds).not.toContain(a.accountId);
      const plan = await A.db.execute(sql`explain select * from adscale_equipe.equipe_task_outbox where dispatched_at is null order by created_at`);
      expect(plan.rows.length).toBeGreaterThan(0);
    });

    it("free accounts are not swept by the paid-account job selection", async () => {
      const a = await freeAccount();
      const accounts = await m.free.depsFor(A).uow.internal.listAccounts();
      expect(accounts.filter((x: { accountId: string }) => x.accountId === a.accountId)).toEqual([]);
    });
  });
});
