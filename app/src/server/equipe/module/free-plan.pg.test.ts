/**
 * `readEntryAccountFromDb` (ticket 11, part 2) against REAL Postgres: the entry account of a workspace is the oldest by
 * created_at, then id; only the workspace's own accounts count; no account is null. The module reads through the global
 * `db`, so DATABASE_URL is routed to the test database before it is imported. The database is shared: every assertion
 * is about the workspaces created here, and they are deleted at the end (accounts and profiles go by cascade).
 *
 *   TEST_DATABASE_URL=postgres://USER@localhost:5432/DBNAME_test npm test -- src/server/equipe/module/free-plan.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;

type Mods = Awaited<ReturnType<typeof load>>;
async function load() {
  const [free, plan, schema, equipeSchema] = await Promise.all([
    import("./testing/free-pg"), import("./free-plan"), import("@/server/db/schema"), import("@/server/db/equipe-schema"),
  ]);
  return { free, plan, schema, equipeSchema };
}

describe.skipIf(!ENABLED)("readEntryAccountFromDb (pg)", () => {
  let m: Mods;
  let h: ReturnType<Mods["free"]["openPool"]>;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  async function workspace() {
    const seeded = await m.free.seedWorkspace(h);
    workspaceIds.push(seeded.workspaceId);
    userIds.push(seeded.userId);
    return seeded.workspaceId;
  }

  async function account(workspaceId: string, status: string, createdAt: string, id?: string) {
    const [profile] = await h.db.insert(m.schema.clientProfiles).values({ workspaceId, name: `Marca ${status}` }).returning();
    const [row] = await h.db.insert(m.equipeSchema.equipeAccounts)
      .values({ ...(id ? { id } : {}), workspaceId, clientProfileId: profile!.id, status, createdAt: new Date(createdAt) })
      .returning();
    return row!;
  }

  beforeAll(async () => {
    m = await load();
    (m.free.assertTestDatabase as (url: string | null) => void)(TEST_DATABASE_URL);
    h = m.free.openPool(TEST_DATABASE_URL!);
    await m.free.assertEffectiveDatabase(h, TEST_DATABASE_URL!);
  }, 60_000);
  afterAll(async () => {
    if (!ENABLED) return;
    await m.free.cleanup(h, workspaceIds, userIds);
    await h.pool.end();
  }, 60_000);

  it("a workspace without accounts has no entry account", async () => {
    expect(await m.plan.readEntryAccountFromDb(await workspace())).toBeNull();
  });

  it("is the oldest account by created_at, whatever the insertion order", async () => {
    const ws = await workspace();
    await account(ws, "active", "2026-03-01T00:00:00Z");
    const oldest = await account(ws, "free", "2026-01-01T00:00:00Z");
    await account(ws, "free", "2026-02-01T00:00:00Z");

    expect(await m.plan.readEntryAccountFromDb(ws)).toEqual({ id: oldest.id, status: "free" });
  });

  it("breaks a created_at tie by id", async () => {
    const ws = await workspace();
    const same = "2026-01-01T00:00:00.000Z";
    // Fresh ids every run (the database is shared and a crashed run leaves its rows): the smaller one goes in last.
    const [low, high] = [crypto.randomUUID(), crypto.randomUUID()].sort();
    await account(ws, "active", same, high);
    await account(ws, "free", same, low);

    expect(await m.plan.readEntryAccountFromDb(ws)).toEqual({ id: low, status: "free" });
  });

  it("only reads the workspace's own accounts", async () => {
    const mine = await workspace();
    const other = await workspace();
    await account(other, "free", "2025-01-01T00:00:00Z");
    const own = await account(mine, "active", "2026-01-01T00:00:00Z");

    expect(await m.plan.readEntryAccountFromDb(mine)).toEqual({ id: own.id, status: "active" });
  });

  it("the rule over the real reader: free entry gives its id, paid entry (with a newer free) gives null, pilot off reads nothing", async () => {
    const gate = { enabledRaw: "true", allowlistRaw: "*" } as const;
    const freeWs = await workspace();
    const entry = await account(freeWs, "free", "2026-01-01T00:00:00Z");
    const paidWs = await workspace();
    await account(paidWs, "active", "2026-01-01T00:00:00Z");
    await account(paidWs, "free", "2026-02-01T00:00:00Z");
    const emptyWs = await workspace();

    expect(await m.plan.findFreePlanAccount(freeWs, undefined, gate)).toEqual({ accountId: entry.id });
    expect(await m.plan.findFreePlanAccount(paidWs, undefined, gate)).toBeNull();
    expect(await m.plan.findFreePlanAccount(emptyWs, undefined, gate)).toBeNull();
    expect(await m.plan.findFreePlanAccount(freeWs, undefined, { enabledRaw: "false", allowlistRaw: "*" })).toBeNull();
  });
});
