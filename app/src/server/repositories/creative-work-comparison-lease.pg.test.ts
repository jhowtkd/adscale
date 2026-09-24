import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  clientProfiles,
  creativeWorkComparisonLeases,
  creativeWorkItems,
  user,
  workspaces,
} from "@/server/db/schema";
import {
  setArtRefinementStateWithComparisonLease,
  withCreativeWorkComparisonLease,
} from "./creative-work-comparison-lease";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const parsed = new URL(testUrl);
  if (!(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.endsWith("_test") && process.env.DATABASE_URL === testUrl)) {
    throw new Error("Comparison lease test requires matching local TEST_DATABASE_URL and DATABASE_URL ending in _test");
  }
}
const RUN_DB_TEST = Boolean(testUrl);
const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];
const ready = { recommendedOutputIds: [], status: "ready" as const, issues: [], comparisons: {} };

async function scope() {
  const id = randomUUID();
  const userId = `comparison-${id}`;
  await db.insert(user).values({ id: userId, name: "Comparison", email: `${id}@example.com`, emailVerified: true });
  const [workspace] = await db.insert(workspaces).values({ name: id, slug: id }).returning();
  const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspace.id, name: id }).returning();
  const [work] = await db.insert(creativeWorkItems).values({
    workspaceId: workspace.id,
    clientProfileId: profile.id,
    createdByUserId: userId,
    title: id,
    request: "Test",
    toolKind: "variations",
    status: "ready",
    format: "4:5",
    settings: { targetFormats: [] },
  }).returning();
  createdUsers.push(userId);
  createdWorkspaces.push(workspace.id);
  return { workspaceId: workspace.id, workItemId: work.id };
}

describe.skipIf(!RUN_DB_TEST)("art comparison lease (Postgres)", () => {
  beforeAll(async () => {
    await db.execute(sql`select 1 from adscale_app.creative_work_comparison_leases limit 0`);
  });

  afterAll(async () => {
    if (createdWorkspaces.length) await db.delete(workspaces).where(inArray(workspaces.id, createdWorkspaces));
    if (createdUsers.length) await db.delete(user).where(inArray(user.id, createdUsers));
  });

  it("serializes two processes without holding a transaction during the callback", async () => {
    const { workspaceId, workItemId } = await scope();
    let enteredFirst!: () => void;
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>((resolve) => { enteredFirst = resolve; });
    const firstReleased = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const order: string[] = [];

    const first = withCreativeWorkComparisonLease(workspaceId, workItemId, async () => {
      order.push("first");
      enteredFirst();
      await firstReleased;
    });
    await firstEntered;
    const second = withCreativeWorkComparisonLease(workspaceId, workItemId, async () => {
      order.push("second");
    });
    const activity = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from pg_stat_activity
      where datname = current_database() and state = 'idle in transaction'
    `);
    expect(activity.rows[0]?.count).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(order).toEqual(["first"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
    expect(await db.select().from(creativeWorkComparisonLeases).where(eq(creativeWorkComparisonLeases.workItemId, workItemId))).toEqual([]);
  });

  it("ignores a refresh after the Work was deleted or is outside the workspace", async () => {
    let called = false;
    await withCreativeWorkComparisonLease(randomUUID(), randomUUID(), async () => { called = true; });
    expect(called).toBe(false);
  });

  it("recovers an expired lease and fences stale writers", async () => {
    const { workspaceId, workItemId } = await scope();
    const staleToken = randomUUID();
    await db.insert(creativeWorkComparisonLeases).values({
      workspaceId, workItemId, token: staleToken, leaseExpiresAt: new Date(0),
    });

    await withCreativeWorkComparisonLease(workspaceId, workItemId, async (token) => {
      expect(token).not.toBe(staleToken);
      expect(await setArtRefinementStateWithComparisonLease(workspaceId, workItemId, staleToken, ready)).toBe(false);
      expect(await setArtRefinementStateWithComparisonLease(workspaceId, workItemId, token, ready)).toBe(true);
    });
    const [work] = await db.select({ artRefinementState: creativeWorkItems.artRefinementState })
      .from(creativeWorkItems).where(eq(creativeWorkItems.id, workItemId));
    expect(work?.artRefinementState).toEqual(ready);
  });
});
