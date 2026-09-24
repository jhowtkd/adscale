import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { usageEvents, workspaces } from "@/server/db/schema";
import { listStudioUsageEventsForWindows } from "./usage";

const url = process.env.DATABASE_URL;
const localTestDb = url && new URL(url).hostname === "localhost"
  && new URL(url).port === "5433" && new URL(url).pathname === "/adscale_test";
const testPg = localTestDb ? describe : describe.skip;

testPg("Studio usage aggregation against isolated PostgreSQL", () => {
  const workspaceId = crypto.randomUUID();
  const otherWorkspaceId = crypto.randomUUID();
  const workId = crypto.randomUUID();
  const otherWorkId = crypto.randomUUID();
  const tag = `studio-usage-${workspaceId}`;
  let created = false;

  beforeAll(async () => {
    await db.insert(workspaces).values([
      { id: workspaceId, name: tag, slug: tag },
      { id: otherWorkspaceId, name: `${tag}-other`, slug: `${tag}-other` },
    ]);
    created = true;
    await db.insert(usageEvents).values([
      { workspaceId, type: "test", amount: 8, metadata: { creativeWorkId: workId }, createdAt: new Date("2026-07-01T12:00:00.000Z") },
      { workspaceId, type: "test", amount: -8, metadata: { creativeWorkId: workId, refund: true, description: "creative_work_dispatch_refund" }, createdAt: new Date("2026-07-01T13:00:00.000Z") },
      { workspaceId, type: "test", amount: -8, metadata: { creativeWorkId: workId, refund: "true", description: "creative_work_dispatch_refund" }, createdAt: new Date("2026-07-01T11:00:00.000Z") },
      { workspaceId, type: "test", amount: 8, metadata: { creativeWorkId: workId }, createdAt: new Date("2026-07-03T12:00:00.000Z") },
      { workspaceId, type: "test", amount: 8, metadata: { creativeWorkId: otherWorkId }, createdAt: new Date("2026-07-01T12:00:00.000Z") },
      { workspaceId: otherWorkspaceId, type: "test", amount: 8, metadata: { creativeWorkId: workId }, createdAt: new Date("2026-07-01T12:00:00.000Z") },
    ]);
  });

  afterAll(async () => {
    if (created) {
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    }
  });

  it("counts exact debit and boolean refund flags inside the scoped window", async () => {
    const rows = await listStudioUsageEventsForWindows([{
      workspaceId,
      creativeWorkId: workId,
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-02T00:00:00.000Z"),
    }]);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.createdAt.toISOString())).toEqual([
      "2026-07-01T12:00:00.000Z",
      "2026-07-01T13:00:00.000Z",
      "2026-07-01T13:00:00.000Z",
    ]);
    expect(rows.every((row) => row.workspaceId === workspaceId)).toBe(true);
    expect(rows[2].metadata).toEqual({
      creativeWorkId: workId,
      refund: true,
      description: "creative_work_dispatch_refund",
    });
  });

  it("reads windows after the first query batch without truncating", async () => {
    const emptyWindows = Array.from({ length: 100 }, () => ({
      workspaceId,
      creativeWorkId: crypto.randomUUID(),
      startedAt: new Date("2026-07-01T00:00:00.000Z"),
      endsAt: new Date("2026-07-02T00:00:00.000Z"),
    }));
    const rows = await listStudioUsageEventsForWindows([
      ...emptyWindows,
      { ...emptyWindows[0], creativeWorkId: workId },
    ]);
    expect(rows).toHaveLength(3);
  });
});
