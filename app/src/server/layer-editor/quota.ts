import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { usageEvents } from "@/server/db/schema";
import {
  getActiveLayerEditorEntitlementByWorkspace,
  layerEditorEntitlementMetadataSchema,
} from "@/server/repositories/entitlements";

import type { LayerEditorAccessV1, LayerEditorQuotaBucket } from "./contracts";

export type LayerEditorQuotaKind = "layerize_v1" | "layer_regeneration_v1";
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LayerEditorOperationExecutor = DbTx;

/**
 * Serialize the durable pre-provider decision for one operation. The quota
 * month lock remains inside claim/release, so this lock must always be taken
 * first by request paths to avoid an operation replay racing compensation.
 */
export async function withLayerEditorOperationLock<T>(input: {
  workspaceId: string;
  kind: LayerEditorQuotaKind;
  operationId: string;
}, run: (executor: LayerEditorOperationExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.kind}:${input.operationId}`}))`);
    return run(tx);
  });
}

/**
 * Serializes the committed dispatch/compensation phase. This deliberately
 * uses a new transaction: reservation must be visible before an event can be
 * delivered, while a same-operation replay must wait through send and any
 * definitive compensation.
 */
export async function withLayerEditorPostDispatchLock<T>(input: {
  workspaceId: string;
  kind: LayerEditorQuotaKind;
  operationId: string;
}, run: (executor: LayerEditorOperationExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.kind}:${input.operationId}:dispatch`}))`);
    return run(tx);
  });
}

function monthWindow(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, key: start.toISOString().slice(0, 7) };
}

function quotaLimit(kind: LayerEditorQuotaKind, metadata: unknown): number | null {
  const parsed = layerEditorEntitlementMetadataSchema.safeParse(metadata);
  if (!parsed.success) return null;
  return kind === "layerize_v1" ? parsed.data.layerizeMonthlyLimit : parsed.data.regenerationMonthlyLimit;
}

async function usedInWindow(tx: DbTx, workspaceId: string, kind: LayerEditorQuotaKind, start: Date, end: Date): Promise<number> {
  const rows = await tx.select({ used: sql<number>`coalesce(sum(${usageEvents.amount}), 0)` }).from(usageEvents).where(and(
    eq(usageEvents.workspaceId, workspaceId), eq(usageEvents.type, kind), gte(usageEvents.createdAt, start), lt(usageEvents.createdAt, end),
  ));
  return Number(rows[0]?.used ?? 0);
}

async function bucket(workspaceId: string, kind: LayerEditorQuotaKind, now: Date): Promise<LayerEditorQuotaBucket | null> {
  const entitlement = await getActiveLayerEditorEntitlementByWorkspace(workspaceId, now);
  const limit = entitlement ? quotaLimit(kind, entitlement.metadata) : null;
  if (limit === null) return null;
  const window = monthWindow(now);
  const rows = await db.select({ used: sql<number>`coalesce(sum(${usageEvents.amount}), 0)` }).from(usageEvents).where(and(
    eq(usageEvents.workspaceId, workspaceId), eq(usageEvents.type, kind), gte(usageEvents.createdAt, window.start), lt(usageEvents.createdAt, window.end),
  ));
  const used = Math.max(0, Number(rows[0]?.used ?? 0));
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export async function getLayerEditorAccess(workspaceId: string, now: Date): Promise<LayerEditorAccessV1> {
  const entitlement = await getActiveLayerEditorEntitlementByWorkspace(workspaceId, now);
  if (!entitlement || !layerEditorEntitlementMetadataSchema.safeParse(entitlement.metadata).success) {
    return { enabled: false, period: null, layerize: null, regeneration: null };
  }
  const window = monthWindow(now);
  const [layerize, regeneration] = await Promise.all([bucket(workspaceId, "layerize_v1", now), bucket(workspaceId, "layer_regeneration_v1", now)]);
  return { enabled: true, period: { startsAt: window.start.toISOString(), endsAt: window.end.toISOString() }, layerize, regeneration };
}

export async function claimLayerEditorQuota(input: {
  workspaceId: string; kind: LayerEditorQuotaKind; operationId: string; userId: string; workItemId: string; outputId: string; commandFingerprint?: string;
}, now: Date, executor?: LayerEditorOperationExecutor): Promise<{ ok: true; replay: boolean } | { ok: false; code: "disabled" | "quota_exhausted" | "operation_conflict" }> {
  const window = monthWindow(now);
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}`;
  const claim = async (tx: LayerEditorOperationExecutor) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.kind}:${window.key}`}))`);
    const existing = await tx.select({ id: usageEvents.id, metadata: usageEvents.metadata }).from(usageEvents).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, claimKey))).limit(1);
    if (existing[0]) {
      const metadata = existing[0].metadata as Record<string, unknown> | null;
      const matches = metadata?.userId === input.userId
        && metadata.workItemId === input.workItemId
        && metadata.outputId === input.outputId
        && (input.commandFingerprint ? metadata.commandFingerprint === input.commandFingerprint : !metadata?.commandFingerprint);
      return matches ? { ok: true as const, replay: true } : { ok: false as const, code: "operation_conflict" as const };
    }
    const entitlement = await getActiveLayerEditorEntitlementByWorkspace(input.workspaceId, now, tx);
    const limit = entitlement ? quotaLimit(input.kind, entitlement.metadata) : null;
    if (limit === null) return { ok: false as const, code: "disabled" as const };
    if (await usedInWindow(tx, input.workspaceId, input.kind, window.start, window.end) >= limit) return { ok: false as const, code: "quota_exhausted" as const };
    await tx.insert(usageEvents).values({ workspaceId: input.workspaceId, type: input.kind, amount: 1, idempotencyKey: claimKey, metadata: { operationId: input.operationId, userId: input.userId, workItemId: input.workItemId, outputId: input.outputId, commandFingerprint: input.commandFingerprint ?? null } });
    return { ok: true as const, replay: false };
  };
  return executor ? claim(executor) : db.transaction(claim);
}

export async function releaseLayerEditorQuota(input: { workspaceId: string; kind: LayerEditorQuotaKind; operationId: string }, now: Date, executor?: LayerEditorOperationExecutor): Promise<{ released: boolean }> {
  // Kept in the public seam for callers; the recorded claim, not the failure
  // clock, determines the accounting period of a compensation.
  void now;
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}`;
  const releaseKey = `${claimKey}:release`;
  const release = async (tx: LayerEditorOperationExecutor) => {
    const claim = await tx.select({ id: usageEvents.id, createdAt: usageEvents.createdAt }).from(usageEvents).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, claimKey))).limit(1);
    if (!claim[0]) return { released: false };
    const window = monthWindow(claim[0].createdAt);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.workspaceId}:${input.kind}:${window.key}`}))`);
    const released = await tx.select({ id: usageEvents.id }).from(usageEvents).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, releaseKey))).limit(1);
    if (released[0]) return { released: false };
    await tx.insert(usageEvents).values({ workspaceId: input.workspaceId, type: input.kind, amount: -1, idempotencyKey: releaseKey, createdAt: claim[0].createdAt, metadata: { operationId: input.operationId, operation: "release" } });
    return { released: true };
  };
  return executor ? release(executor) : db.transaction(release);
}

/** A replay is recoverable only while its compensating release has not been recorded. */
export async function isLayerEditorQuotaReleased(input: { workspaceId: string; kind: LayerEditorQuotaKind; operationId: string }, executor: Pick<LayerEditorOperationExecutor, "select"> = db): Promise<boolean> {
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}:release`;
  const [release] = await executor.select({ id: usageEvents.id }).from(usageEvents).where(and(
    eq(usageEvents.workspaceId, input.workspaceId),
    eq(usageEvents.idempotencyKey, claimKey),
  )).limit(1);
  return Boolean(release);
}

export async function markLayerEditorQuotaReservationCommitted(input: { workspaceId: string; kind: LayerEditorQuotaKind; operationId: string }, executor: Pick<LayerEditorOperationExecutor, "update"> = db): Promise<boolean> {
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}`;
  const rows = await executor.update(usageEvents).set({
    metadata: sql`coalesce(${usageEvents.metadata}, '{}'::jsonb) || '{"reservationCommitted":true}'::jsonb`,
  }).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, claimKey))).returning({ id: usageEvents.id });
  return rows.length > 0;
}

export async function isLayerEditorQuotaReservationCommitted(input: { workspaceId: string; kind: LayerEditorQuotaKind; operationId: string }, executor: Pick<LayerEditorOperationExecutor, "select"> = db): Promise<boolean> {
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}`;
  const [claim] = await executor.select({ metadata: usageEvents.metadata }).from(usageEvents).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, claimKey))).limit(1);
  return (claim?.metadata as Record<string, unknown> | null)?.reservationCommitted === true;
}

export async function markLayerEditorQuotaDispatchCommitted(input: { workspaceId: string; kind: LayerEditorQuotaKind; operationId: string }, executor: Pick<LayerEditorOperationExecutor, "update"> = db): Promise<boolean> {
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}`;
  const rows = await executor.update(usageEvents).set({ metadata: sql`coalesce(${usageEvents.metadata}, '{}'::jsonb) || '{"dispatchCommitted":true}'::jsonb` }).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, claimKey))).returning({ id: usageEvents.id });
  return rows.length > 0;
}

export async function isLayerEditorQuotaDispatchCommitted(input: { workspaceId: string; kind: LayerEditorQuotaKind; operationId: string }, executor: Pick<LayerEditorOperationExecutor, "select"> = db): Promise<boolean> {
  const claimKey = `layer-editor:${input.workspaceId}:${input.kind}:${input.operationId}`;
  const [claim] = await executor.select({ metadata: usageEvents.metadata }).from(usageEvents).where(and(eq(usageEvents.workspaceId, input.workspaceId), eq(usageEvents.idempotencyKey, claimKey))).limit(1);
  return (claim?.metadata as Record<string, unknown> | null)?.dispatchCommitted === true;
}
