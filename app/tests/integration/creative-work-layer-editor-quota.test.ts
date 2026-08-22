import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { usageEvents, user, workspaceEntitlements, workspaceMembers, workspaces } from "@/server/db/schema";
import { claimLayerEditorQuota } from "@/server/layer-editor/quota";

const configured = Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let workspaceId: string | null = null;
let userId: string | null = null;

describe.skipIf(!configured)("layer editor regeneration quota", () => {
  afterAll(async () => {
    if (workspaceId) {
      await db.delete(usageEvents).where(eq(usageEvents.workspaceId, workspaceId));
      await db.delete(workspaceEntitlements).where(eq(workspaceEntitlements.workspaceId, workspaceId));
      await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
      await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
    if (userId) await db.delete(user).where(eq(user.id, userId));
  });

  it("allows one concurrent claim at limit one and replays only its winner", async () => {
    userId = `layer-editor-quota-${suffix}`;
    await db.insert(user).values({ id: userId, name: "Quota test", email: `${userId}@example.test`, emailVerified: true });
    const [workspace] = await db.insert(workspaces).values({ name: `Layer quota ${suffix}`, slug: `layer-quota-${suffix}` }).returning();
    workspaceId = workspace.id;
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
    await db.insert(workspaceEntitlements).values({ workspaceId, kind: "layer_editor_v1", status: "active", metadata: { layerizeMonthlyLimit: 1, regenerationMonthlyLimit: 1 }, startsAt: new Date(Date.now() - 60_000) });

    const base = { workspaceId, kind: "layer_regeneration_v1" as const, userId, workItemId: "work", outputId: "output" };
    const [left, right] = await Promise.all([
      claimLayerEditorQuota({ ...base, operationId: "00000000-0000-4000-8000-000000000101" }, new Date()),
      claimLayerEditorQuota({ ...base, operationId: "00000000-0000-4000-8000-000000000102" }, new Date()),
    ]);
    expect([left, right].filter((result) => result.ok)).toHaveLength(1);
    expect([left, right].filter((result) => !result.ok && result.code === "quota_exhausted")).toHaveLength(1);
    const rows = await db.select({ amount: sql<number>`coalesce(sum(${usageEvents.amount}), 0)` }).from(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId), eq(usageEvents.type, "layer_regeneration_v1")));
    expect(Number(rows[0]?.amount)).toBe(1);
    const winner = left.ok ? "00000000-0000-4000-8000-000000000101" : "00000000-0000-4000-8000-000000000102";
    await expect(claimLayerEditorQuota({ ...base, operationId: winner }, new Date())).resolves.toEqual({ ok: true, replay: true });
  });
});
