/**
 * `deleteUnusedAssistantThread` against REAL Postgres: it takes back a conversation that was created and never used
 * (the cleanup when its binding to an Equipe account was refused) and nothing else. The race is the point: the
 * binding insert and the delete meet on the thread row, so a binding is never left pointing at a deleted thread.
 *
 *   TEST_DATABASE_URL=postgres://… npx vitest run --config config/vitest.config.ts src/server/repositories/assistant-thread.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, getTableName, sql } from "drizzle-orm";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, commands, schema, equipeSchema, repo, appDb] = await Promise.all([
    import("../equipe/module/testing/free-pg"), import("../equipe/module/commands"),
    import("@/server/db/schema"), import("@/server/db/equipe-schema"), import("./assistant-thread"), import("@/server/db"),
  ]);
  return { free, commands, schema, equipeSchema, repo, appDb };
}

const SYSTEM = { kind: "system", job: "free-open" } as const;

describe.skipIf(!ENABLED)("deleteUnusedAssistantThread (pg)", () => {
  let m: Mods; let A: ReturnType<Mods["free"]["openPool"]>; let B: ReturnType<Mods["free"]["openPool"]>;
  const workspaces: string[] = []; const users: string[] = [];

  beforeAll(async () => {
    m = await load();
    A = m.free.openPool(TEST_DATABASE_URL!); B = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(A, TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    if (!ENABLED) return;
    await m.free.cleanup(A, workspaces, users);
    await A.pool.end(); await B.pool.end();
  });

  async function account() {
    const seeded = await m.free.seedWorkspace(A);
    workspaces.push(seeded.workspaceId); users.push(seeded.userId);
    const out = await m.commands.executeCommand(m.free.depsFor(A), { actor: SYSTEM, workspaceId: seeded.workspaceId }, { type: "open_free_account", payload: { userId: seeded.userId } });
    if (!out.ok) throw new Error(out.error.code);
    const accountId = out.value.accountId!;
    const scope = { workspaceId: seeded.workspaceId, accountId };
    const uow = m.free.depsFor(A).uow;
    const row = await uow.repos.accounts.get(seeded.workspaceId, accountId);
    const [person] = await uow.repos.people.list(scope);
    const approver = { kind: "client_person", role: "approver", personId: person!.id } as const;
    return { ...seeded, accountId, scope, clientProfileId: row!.clientProfileId, approver };
  }
  async function newThread(a: { workspaceId: string; clientProfileId: string }, over: Record<string, unknown> = {}) {
    const [thread] = await A.db.insert(m.schema.assistantThreads).values({ workspaceId: a.workspaceId, clientProfileId: a.clientProfileId, name: "Nova", ...over }).returning();
    return thread!;
  }
  const exists = async (threadId: string) => (await A.db.select().from(m.schema.assistantThreads).where(eq(m.schema.assistantThreads.id, threadId))).length === 1;
  const bind = (pool: typeof A, a: Awaited<ReturnType<typeof account>>, assistantThreadId: string) =>
    m.commands.executeCommand(m.free.depsFor(pool), { actor: a.approver, workspaceId: a.workspaceId, accountId: a.accountId }, { type: "open_parallel_thread", payload: { assistantThreadId, topic: "Natal" } });

  it("takes back a conversation that was created and never used", async () => {
    const a = await account();
    const thread = await newThread(a);
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("deleted");
    expect(await exists(thread.id)).toBe(false);
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("not_found");
  });

  it("never touches a thread of another workspace", async () => {
    const a = await account(); const other = await account();
    const thread = await newThread(a);
    expect(await m.repo.deleteUnusedAssistantThread(other.workspaceId, thread.id)).toBe("not_found");
    expect(await exists(thread.id)).toBe(true);
  });

  it("keeps a thread that has a message", async () => {
    const a = await account();
    const thread = await newThread(a);
    await A.db.insert(m.schema.assistantMessages).values({ workspaceId: a.workspaceId, threadId: thread.id, sequence: 1, type: "user", content: "oi", payload: {} });
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("in_use");
    expect(await exists(thread.id)).toBe(true);
  });

  it("keeps a default thread, including the main conversation of an account", async () => {
    const a = await account();
    const own = await newThread(a, { isDefault: true });
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, own.id)).toBe("in_use");
    const [primary] = await m.free.depsFor(A).uow.repos.threads.list(a.scope);
    expect(primary!.assistantThreadId).toBeTruthy();
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, primary!.assistantThreadId!)).toBe("in_use");
    expect(await exists(primary!.assistantThreadId!)).toBe(true);
  });

  it("keeps a goal-agent thread: its goal run is born with the thread, before the first message, and would go with it", async () => {
    const a = await account();
    const thread = await newThread(a);
    const { createGoalRun } = await import("./assistant-goal");
    await createGoalRun({ workspaceId: a.workspaceId, clientProfileId: a.clientProfileId, threadId: thread.id, userId: a.userId });
    const goals = () => A.db.select().from(m.schema.assistantGoalRuns).where(eq(m.schema.assistantGoalRuns.threadId, thread.id));
    expect(await goals()).toHaveLength(1);
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("in_use");
    expect(await exists(thread.id)).toBe(true);
    expect(await goals()).toHaveLength(1);
  });

  it("lists every table that hangs off a thread, so one added later cannot be forgotten", async () => {
    const result = await A.db.execute(sql`
      select (c.conrelid::regclass)::text as tbl, a.attname as col, c.confdeltype::text as action
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.confrelid = 'adscale_app.assistant_threads'::regclass`);
    const bare = (table: string) => table.replace(/^[a-z_]+\./, "");
    const keys = (action: string) => (result.rows as { tbl: string; col: string; action: string }[])
      .filter((row) => row.action === action).map((row) => `${bare(row.tbl)}.${row.col}`).sort();
    const listed = m.repo.THREAD_DEPENDENTS.map(([table, column]) => `${getTableName(table)}.${column.name}`).sort();
    // What the delete would take along (cascade) is exactly what the list checks.
    expect(keys("c")).toEqual(listed);
    // A foreign key that only nulls its pointer loses no row: the thread another one was migrated from, and the account's
    // ownership, which the delete asks for by itself. No other kind exists.
    expect(keys("n")).toEqual(["assistant_threads.migrated_from_thread_id", "equipe_threads.assistant_thread_id"]);
    expect(result.rows.filter((row) => !["c", "n"].includes((row as { action: string }).action))).toEqual([]);
  });

  it("keeps a thread older than the window", async () => {
    const a = await account();
    const thread = await newThread(a);
    await A.db.execute(sql`update adscale_app.assistant_threads set created_at = now() - make_interval(secs => ${m.repo.UNUSED_THREAD_WINDOW_SECONDS + 60}) where id = ${thread.id}`);
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("in_use");
    expect(await exists(thread.id)).toBe(true);
  });

  it("keeps a thread that an account owns, and the binding stays whole", async () => {
    const a = await account();
    const thread = await newThread(a);
    const bound = await bind(A, a, thread.id);
    expect(bound.ok).toBe(true);
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("in_use");
    const rows = await m.free.depsFor(A).uow.repos.threads.list(a.scope);
    expect(rows.filter((row) => row.assistantThreadId === thread.id)).toHaveLength(1);
  });

  it("a binding that is being committed makes the delete wait for it and then keep the thread: never a binding without its thread", async () => {
    const a = await account();
    const thread = await newThread(a);
    // The binding insert is open (not committed): through its foreign key it holds the thread row.
    const client = await B.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into adscale_equipe.equipe_threads (id, workspace_id, account_id, kind, topic, assistant_thread_id) values (gen_random_uuid(), $1, $2, 'parallel', 'Natal', $3)",
        [a.workspaceId, a.accountId, thread.id],
      );
      const removal = m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id);
      // Deterministic barrier: the delete is waiting on a lock, not racing past it.
      await m.free.waitUntil(async () => {
        const rows = await A.db.execute(sql`select count(*)::int as n from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock' and query ilike '%assistant_threads%'`);
        return (rows.rows[0] as { n: number }).n > 0;
      }, "the delete waits for the binding");
      await client.query("commit");
      // Once the binding is committed the delete sees its owner and leaves the thread alone.
      expect(await removal).toBe("in_use");
    } finally {
      client.release();
    }
    expect(await exists(thread.id)).toBe(true);
    const rows = await m.free.depsFor(A).uow.repos.threads.list(a.scope);
    expect(rows.filter((row) => row.assistantThreadId === thread.id)).toHaveLength(1);
  });

  it("a delete that comes first wins: the binding is refused because the thread is gone", async () => {
    const a = await account();
    const thread = await newThread(a);
    expect(await m.repo.deleteUnusedAssistantThread(a.workspaceId, thread.id)).toBe("deleted");
    const out = await bind(A, a, thread.id).catch((error: unknown) => ({ ok: false as const, error }));
    expect(out.ok).toBe(false);
    const dangling = await A.db.execute(sql`select count(*)::int as n from adscale_equipe.equipe_threads where account_id = ${a.accountId} and kind = 'parallel' and assistant_thread_id is null`);
    expect((dangling.rows[0] as { n: number }).n).toBe(0);
  });
});
