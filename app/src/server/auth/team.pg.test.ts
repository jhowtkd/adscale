/**
 * Member removal against REAL Postgres: the caller's role decides which target roles it may remove, and two owners
 * removing each other at the same time never leave the workspace without an owner.
 *
 * Set TEST_DATABASE_URL to a migrated `_test` database, then run: npm test -- src/server/auth/team.pg.test.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEquipeTestDatabaseUrl } from "../equipe/data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;
const ENABLED = TEST_DATABASE_URL !== null;
const RUN = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}`;

async function load() {
  const [team, schema, dbModule] = await Promise.all([
    import("./team"),
    import("@/server/db/schema"),
    import("@/server/db"),
  ]);
  return { team, schema, db: dbModule.db };
}

type Role = "owner" | "admin" | "member";

describe.skipIf(!ENABLED)("removeMember (pg)", () => {
  let m: Awaited<ReturnType<typeof load>>;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let seq = 0;

  beforeAll(async () => {
    m = await load();
  });

  afterAll(async () => {
    if (workspaceIds.length) await m.db.delete(m.schema.workspaces).where(inArray(m.schema.workspaces.id, workspaceIds));
    if (userIds.length) await m.db.delete(m.schema.user).where(inArray(m.schema.user.id, userIds));
  });

  async function workspaceWith(...roles: Role[]) {
    seq += 1;
    const tag = `rm-${RUN}-${seq}`;
    const [workspace] = await m.db.insert(m.schema.workspaces).values({ name: tag, slug: tag }).returning();
    workspaceIds.push(workspace.id);
    const ids = roles.map((_, i) => `user-${tag}-${i}`);
    await m.db
      .insert(m.schema.user)
      .values(ids.map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })));
    userIds.push(...ids);
    await m.db
      .insert(m.schema.workspaceMembers)
      .values(ids.map((userId, i) => ({ workspaceId: workspace.id, userId, role: roles[i] })));
    return { workspaceId: workspace.id, ids };
  }

  async function memberRows(workspaceId: string) {
    return m.db
      .select({ userId: m.schema.workspaceMembers.userId, role: m.schema.workspaceMembers.role })
      .from(m.schema.workspaceMembers)
      .where(eq(m.schema.workspaceMembers.workspaceId, workspaceId));
  }

  it.each<[Role, Role, string]>([
    ["owner", "owner", "removed"],
    ["owner", "admin", "removed"],
    ["owner", "member", "removed"],
    ["admin", "owner", "forbidden"],
    ["admin", "admin", "forbidden"],
    ["admin", "member", "removed"],
    ["member", "owner", "forbidden"],
    ["member", "member", "forbidden"],
  ])("%s removing %s -> %s", async (actorRole, targetRole, expected) => {
    const { workspaceId, ids } = await workspaceWith(actorRole, targetRole);

    const result = await m.team.removeMember(workspaceId, ids[0], ids[1]);

    expect(result).toBe(expected);
    const remaining = (await memberRows(workspaceId)).map((r) => r.userId);
    expect(remaining.includes(ids[1])).toBe(expected !== "removed");
  });

  it("refuses self-removal, unknown targets and targets from another workspace", async () => {
    const a = await workspaceWith("owner");
    const b = await workspaceWith("member");

    expect(await m.team.removeMember(a.workspaceId, a.ids[0], a.ids[0])).toBe("cannotRemoveSelf");
    expect(await m.team.removeMember(a.workspaceId, a.ids[0], "user-missing")).toBe("memberNotFound");
    expect(await m.team.removeMember(a.workspaceId, a.ids[0], b.ids[0])).toBe("memberNotFound");
    expect(await memberRows(b.workspaceId)).toHaveLength(1);
  });

  it("removes every membership row of the target, not just one", async () => {
    const { workspaceId, ids } = await workspaceWith("owner", "member");
    await m.db.insert(m.schema.workspaceMembers).values({ workspaceId, userId: ids[1], role: "member" });

    expect(await m.team.removeMember(workspaceId, ids[0], ids[1])).toBe("removed");
    expect((await memberRows(workspaceId)).map((r) => r.userId)).toEqual([ids[0]]);
  });

  it("refuses when any of the target's membership rows has a protected role", async () => {
    const { workspaceId, ids } = await workspaceWith("admin", "owner");
    await m.db.insert(m.schema.workspaceMembers).values({ workspaceId, userId: ids[1], role: "member" });

    expect(await m.team.removeMember(workspaceId, ids[0], ids[1])).toBe("forbidden");
    expect(await memberRows(workspaceId)).toHaveLength(3);
  });

  it("keeps one owner when two owners remove each other at the same time", async () => {
    for (let round = 0; round < 10; round++) {
      const { workspaceId, ids } = await workspaceWith("owner", "owner");

      const results = await Promise.all([
        m.team.removeMember(workspaceId, ids[0], ids[1]),
        m.team.removeMember(workspaceId, ids[1], ids[0]),
      ]);

      expect(results.filter((r) => r === "removed")).toHaveLength(1);
      const owners = await m.db
        .select()
        .from(m.schema.workspaceMembers)
        .where(
          and(
            eq(m.schema.workspaceMembers.workspaceId, workspaceId),
            eq(m.schema.workspaceMembers.role, "owner")
          )
        );
      expect(owners).toHaveLength(1);
    }
  });
});
