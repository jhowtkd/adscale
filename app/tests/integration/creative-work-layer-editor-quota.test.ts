import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { clientProfiles, creativeWorkItems, creativeWorkOutputs, usageEvents, user, workspaceEntitlements, workspaceMembers, workspaces } from "@/server/db/schema";
import { claimLayerEditorQuota, releaseLayerEditorQuota, withLayerEditorOperationLock, withLayerEditorPostDispatchLock } from "@/server/layer-editor/quota";
import { claimExpiredCreativeWorkLayerizationRecovery } from "@/server/repositories/creative-work-layerization";

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
    await db.insert(workspaceEntitlements).values({ workspaceId, kind: "layer_editor_v1", status: "active", metadata: { layerizeMonthlyLimit: 5, regenerationMonthlyLimit: 1 }, startsAt: new Date(Date.now() - 60_000) });

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

  it("binds an operation replay to its original output and command", async () => {
    const base = { workspaceId: workspaceId!, kind: "layerize_v1" as const, userId: userId!, workItemId: "work", outputId: "output", operationId: "00000000-0000-4000-8000-000000000103", commandFingerprint: "a".repeat(64) };
    await expect(claimLayerEditorQuota(base, new Date())).resolves.toEqual({ ok: true, replay: false });
    await expect(claimLayerEditorQuota({ ...base, outputId: "other-output" }, new Date())).resolves.toEqual({ ok: false, code: "operation_conflict" });
    await expect(claimLayerEditorQuota({ ...base, commandFingerprint: "b".repeat(64) }, new Date())).resolves.toEqual({ ok: false, code: "operation_conflict" });
  });

  it("requires an active entitlement for an existing operation replay", async () => {
    const base = { workspaceId: workspaceId!, kind: "layer_regeneration_v1" as const, userId: userId!, workItemId: "work", outputId: "revoked-output", operationId: "00000000-0000-4000-8000-000000000106", commandFingerprint: "c".repeat(64) };
    await expect(claimLayerEditorQuota(base, new Date())).resolves.toEqual({ ok: true, replay: false });
    await db.update(workspaceEntitlements).set({ status: "revoked" }).where(eq(workspaceEntitlements.workspaceId, workspaceId!));
    try {
      await expect(claimLayerEditorQuota(base, new Date())).resolves.toEqual({ ok: false, code: "disabled" });
    } finally {
      await db.update(workspaceEntitlements).set({ status: "active" }).where(eq(workspaceEntitlements.workspaceId, workspaceId!));
    }
  });

  it("compensates the claim in its original period rather than the failure month", async () => {
    const operationId = "00000000-0000-4000-8000-000000000104";
    const input = { workspaceId: workspaceId!, kind: "layerize_v1" as const, userId: userId!, workItemId: "work", outputId: "period-output", operationId };
    await expect(claimLayerEditorQuota(input, new Date())).resolves.toEqual({ ok: true, replay: false });
    await expect(releaseLayerEditorQuota({ workspaceId: workspaceId!, kind: "layerize_v1", operationId }, new Date(Date.now() + 40 * 24 * 60 * 60 * 1000))).resolves.toEqual({ released: true });
    const amounts = await db.select({ amount: sql<number>`coalesce(sum(${usageEvents.amount}), 0)` }).from(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId!), eq(usageEvents.idempotencyKey, `layer-editor:${workspaceId}:layerize_v1:${operationId}`)));
    expect(Number(amounts[0]?.amount)).toBe(1);
  });

  it("holds a same-operation replay behind compensation at limit one", async () => {
    const operationId = "00000000-0000-4000-8000-000000000105";
    const input = { workspaceId: workspaceId!, kind: "layer_regeneration_v1" as const, userId: userId!, workItemId: "work", outputId: "serialized-output", operationId };
    let releaseWinner!: () => void;
    const winnerMayCompensate = new Promise<void>((resolve) => { releaseWinner = resolve; });
    let replayEntered = false;

    const winner = withLayerEditorOperationLock(input, async (executor) => {
      await expect(claimLayerEditorQuota(input, new Date(), executor)).resolves.toEqual({ ok: true, replay: false });
      await winnerMayCompensate;
      await expect(releaseLayerEditorQuota(input, new Date(), executor)).resolves.toEqual({ released: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const replay = withLayerEditorOperationLock(input, async (executor) => {
      replayEntered = true;
      return claimLayerEditorQuota(input, new Date(), executor);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(replayEntered).toBe(false);

    releaseWinner();
    await winner;
    await expect(replay).resolves.toEqual({ ok: true, replay: true });
    const rows = await db.select({ amount: sql<number>`coalesce(sum(${usageEvents.amount}), 0)` }).from(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId!), eq(usageEvents.type, "layer_regeneration_v1"), eq(usageEvents.idempotencyKey, `layer-editor:${workspaceId}:layer_regeneration_v1:${operationId}`)));
    expect(Number(rows[0]?.amount)).toBe(1);
    const releases = await db.select({ amount: usageEvents.amount }).from(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId!), eq(usageEvents.idempotencyKey, `layer-editor:${workspaceId}:layer_regeneration_v1:${operationId}:release`)));
    expect(releases).toHaveLength(1);
    expect(releases[0]?.amount).toBe(-1);
  });

  it("serializes a Layerize recovery and queued redelivery on the post-dispatch lock", async () => {
    const input = { workspaceId: workspaceId!, kind: "layerize_v1" as const, operationId: "00000000-0000-4000-8000-000000000107" };
    let releaseRecovery!: () => void;
    const recoveryMayFinish = new Promise<void>((resolve) => { releaseRecovery = resolve; });
    let replayEntered = false;

    const recovery = withLayerEditorPostDispatchLock(input, async () => {
      await recoveryMayFinish;
      return "terminalized";
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const replay = withLayerEditorPostDispatchLock(input, async () => {
      replayEntered = true;
      return "rechecked";
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(replayEntered).toBe(false);

    releaseRecovery();
    await expect(recovery).resolves.toBe("terminalized");
    await expect(replay).resolves.toBe("rechecked");
  });

  it("rolls back expired queued terminalization and quota compensation together", async () => {
    const operationId = "00000000-0000-4000-8000-000000000108";
    const recoveryNow = new Date();
    const [profile] = await db.insert(clientProfiles).values({ workspaceId: workspaceId!, name: `Quota profile ${suffix}` }).returning();
    const [work] = await db.insert(creativeWorkItems).values({
      workspaceId: workspaceId!, clientProfileId: profile.id, createdByUserId: userId!, toolKind: "social_post",
      title: "Quota recovery", request: "Synthetic", brief: { theme: "Synthetic", objective: "Test", audience: "Test", offer: "None" },
      format: "4:5", settings: { targetFormats: [] }, status: "completed",
    }).returning();
    const [output] = await db.insert(creativeWorkOutputs).values({
      workspaceId: workspaceId!, workItemId: work.id, creativeLevel: "balanced", targetFormat: "4:5",
      operationKey: `quota-recovery:${operationId}`, status: "completed", outputKey: `quota/${operationId}.png`, isSelected: true,
      layerization: {
        status: "queued", attemptId: operationId, callbackTokenHash: "a".repeat(64), callbackConsumedAt: null, requestedByUserId: userId!,
        createdAt: "2026-08-12T10:00:00.000Z", updatedAt: "2026-08-12T10:00:00.000Z", callbackDeadlineAt: "2026-08-12T12:00:00.000Z",
        latencyMs: null, providerRequestId: null, providerModel: "fixture", providerEndpoint: "https://fixture.example/layerize", estimatedCostUsd: null,
        baseWidth: null, baseHeight: null, layers: [], psdKey: null, diagnosticZipKey: null, fidelity: null, failureCode: null,
      },
    }).returning();
    const quota = { workspaceId: workspaceId!, kind: "layerize_v1" as const, operationId, userId: userId!, workItemId: work.id, outputId: output.id };
    await expect(claimLayerEditorQuota(quota, recoveryNow)).resolves.toEqual({ ok: true, replay: false });

    await expect(withLayerEditorPostDispatchLock({ workspaceId: workspaceId!, kind: "layerize_v1", operationId }, async (executor) => {
      const claimed = await claimExpiredCreativeWorkLayerizationRecovery({
        workspaceId: workspaceId!, workItemId: work.id, outputId: output.id, attemptId: operationId, now: recoveryNow,
      }, executor);
      expect((claimed?.layerization as { status?: string } | null)?.status).toBe("submission_unknown");
      await releaseLayerEditorQuota({ workspaceId: workspaceId!, kind: "layerize_v1", operationId }, recoveryNow, executor);
      throw new Error("abort recovery transaction");
    })).rejects.toThrow("abort recovery transaction");

    const [persisted] = await db.select({ layerization: creativeWorkOutputs.layerization }).from(creativeWorkOutputs).where(eq(creativeWorkOutputs.id, output.id));
    expect((persisted?.layerization as { status?: string } | null)?.status).toBe("queued");
    const releases = await db.select({ id: usageEvents.id }).from(usageEvents).where(and(
      eq(usageEvents.workspaceId, workspaceId!),
      eq(usageEvents.idempotencyKey, `layer-editor:${workspaceId}:layerize_v1:${operationId}:release`),
    ));
    expect(releases).toHaveLength(0);
  });

  it("completes more distinct locked operations than the pool size on their own transaction executor", async () => {
    const operations = Array.from({ length: 12 }, (_value, index) => ({
      workspaceId: workspaceId!, kind: "layerize_v1" as const, userId: userId!,
      workItemId: `pool-work-${index}`, outputId: `pool-output-${index}`,
      operationId: `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`,
    }));

    const results = await Promise.all(operations.map((input) => withLayerEditorOperationLock(input, async (executor) => {
      const claim = await claimLayerEditorQuota(input, new Date(), executor);
      if (claim.ok) await releaseLayerEditorQuota(input, new Date(), executor);
      return claim;
    })));

    expect(results).toHaveLength(12);
    expect(results.every((result) => result.ok)).toBe(true);
  });
});
