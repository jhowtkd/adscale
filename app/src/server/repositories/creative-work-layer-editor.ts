import "server-only";

import { and, eq, isNull, max, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { creativeWorkOutputs, user, workspaceMembers } from "@/server/db/schema";
import {
  LAYER_EDITOR_LEASE_MS,
  layerEditorStateFromDatabase,
  type LayerEditorMutableSnapshotV1,
  type LayerEditorStateV1,
} from "@/server/layer-editor/contracts";
import { layerizationStateFromDatabase, type LayerizationState } from "@/server/layerize/contracts";
import { creativeWorkVersionLockScope } from "@/server/repositories/creative-work";

type Output = typeof creativeWorkOutputs.$inferSelect;
type LayerEditorExecutor = Pick<typeof db, "select" | "update">;
export type LayerEditorScope = { workspaceId: string; workItemId: string; outputId: string };
export type LayerEditorMutationScope = LayerEditorScope & { userId: string; leaseId: string; expectedRevision: number };
export const LAYER_EDITOR_REGENERATION_PROCESSING_STALE_MS = 5 * 60 * 1000;

/** Only an in-flight candidate blocks ordinary, non-provider editor work. */
export function hasActiveLayerEditorRegeneration(state: LayerEditorStateV1 | null | undefined): boolean {
  return state?.regeneration?.status === "reserved"
    || state?.regeneration?.status === "processing"
    || state?.regeneration?.status === "ready";
}

function scope(input: LayerEditorScope) {
  return and(eq(creativeWorkOutputs.workspaceId, input.workspaceId), eq(creativeWorkOutputs.workItemId, input.workItemId), eq(creativeWorkOutputs.id, input.outputId));
}

function observedLeaseCas(state: LayerEditorStateV1) {
  return state.lease
    ? [sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${state.lease.id}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt' = ${state.lease.expiresAt}`]
    : [sql`${creativeWorkOutputs.layerEditor}->'lease' is null`];
}

function nextLease(userId: string, leaseId: string, now: Date): LayerEditorStateV1["lease"] {
  return { id: leaseId, userId, acquiredAt: now.toISOString(), expiresAt: new Date(now.getTime() + LAYER_EDITOR_LEASE_MS).toISOString() };
}

export function seedLayerEditorState(layerization: LayerizationState, lease: LayerEditorStateV1["lease"], now: Date): LayerEditorStateV1 {
  if (layerization.status !== "completed" || !layerization.baseWidth || !layerization.baseHeight || layerization.layers.length < 2 || layerization.layers.length > 17) throw new Error("Completed Layerize source with 2-17 layers is required");
  const ordered = [...layerization.layers].sort((left, right) => left.order - right.order);
  return {
    schemaVersion: 1, revision: 1, sourceLayerizationAttemptId: layerization.attemptId,
    canvas: { width: layerization.baseWidth, height: layerization.baseHeight },
    layers: ordered.map((layer, index) => ({
      id: crypto.randomUUID(), source: { order: ordered.length - 1 - index, name: layer.name, visible: true, x: layer.x, y: layer.y, width: layer.width, height: layer.height, key: layer.storageKey },
      order: ordered.length - 1 - index, name: layer.name, visible: true, x: layer.x, y: layer.y, width: layer.width, height: layer.height,
      currentKey: layer.storageKey, currentKind: "source" as const, restorableKey: null,
    })),
    lease, regeneration: null, publishedPsdKey: null, updatedAt: now.toISOString(),
  };
}

export async function getCreativeWorkLayerEditorOutput(input: LayerEditorScope, executor: Pick<LayerEditorExecutor, "select"> = db): Promise<Output | null> {
  const [row] = await executor.select().from(creativeWorkOutputs).where(scope(input)).limit(1);
  return row ?? null;
}

/** Resolve only the display name of a lease holder that belongs to this workspace. */
export async function getCreativeWorkLayerEditorLeaseHolderName(workspaceId: string, userId: string): Promise<string | null> {
  const [member] = await db
    .select({ name: user.name })
    .from(workspaceMembers)
    .innerJoin(user, eq(workspaceMembers.userId, user.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return member?.name ?? null;
}

export async function initializeCreativeWorkLayerEditor(input: LayerEditorScope & { state: LayerEditorStateV1 }): Promise<Output | null> {
  const [row] = await db.update(creativeWorkOutputs).set({ layerEditor: input.state, updatedAt: new Date() }).where(and(scope(input), isNull(creativeWorkOutputs.layerEditor))).returning();
  return row ?? null;
}

export async function acquireCreativeWorkLayerEditorLease(input: LayerEditorScope & { userId: string; leaseId: string; now: Date }): Promise<Output | null> {
  const lease = nextLease(input.userId, input.leaseId, input.now);
  const [row] = await db.update(creativeWorkOutputs).set({
    layerEditor: sql`jsonb_set(${creativeWorkOutputs.layerEditor}, '{lease}', ${JSON.stringify(lease)}::jsonb)`, updatedAt: input.now,
  }).where(and(scope(input), sql`(${creativeWorkOutputs.layerEditor}->'lease' is null or ${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId} or (${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt')::timestamptz <= ${input.now.toISOString()}::timestamptz)`)).returning();
  return row ?? null;
}

export async function heartbeatCreativeWorkLayerEditorLease(input: LayerEditorScope & { userId: string; leaseId: string; now: Date }): Promise<Output | null> {
  const expiresAt = new Date(input.now.getTime() + LAYER_EDITOR_LEASE_MS).toISOString();
  const [row] = await db.update(creativeWorkOutputs).set({
    layerEditor: sql`jsonb_set(${creativeWorkOutputs.layerEditor}, '{lease,expiresAt}', ${JSON.stringify(expiresAt)}::jsonb)`, updatedAt: input.now,
  }).where(and(scope(input), sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`, sql`(${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt')::timestamptz > ${input.now.toISOString()}::timestamptz`)).returning();
  return row ?? null;
}

function applySnapshot(state: LayerEditorStateV1, snapshot: LayerEditorMutableSnapshotV1, now: Date): LayerEditorStateV1 | null {
  if (snapshot.layers.length !== state.layers.length || new Set(snapshot.layers.map((layer) => layer.id)).size !== state.layers.length) return null;
  const byId = new Map(snapshot.layers.map((layer) => [layer.id, layer]));
  if (state.layers.some((layer) => !byId.has(layer.id))) return null;
  const next: LayerEditorStateV1 = {
    ...state, revision: state.revision + 1, updatedAt: now.toISOString(),
    layers: state.layers.map((layer) => {
      const mutable = byId.get(layer.id)!;
      const currentKey = mutable.useSource ? layer.source.key : (layer.restorableKey ?? layer.currentKey);
      const restorableKey = mutable.useSource
        ? (layer.currentKind === "regenerated" ? layer.currentKey : layer.restorableKey)
        : layer.restorableKey;
      return { ...layer, order: mutable.order, name: mutable.name, visible: mutable.visible, x: mutable.x, y: mutable.y, width: mutable.width, height: mutable.height,
        currentKey, currentKind: mutable.useSource ? "source" as const : (currentKey === layer.source.key ? "source" as const : "regenerated" as const), restorableKey };
    }),
  };
  return layerEditorStateFromDatabase(next);
}

export async function saveCreativeWorkLayerEditorSnapshot(input: LayerEditorMutationScope & { snapshot: LayerEditorMutableSnapshotV1; now: Date }): Promise<Output | null> {
  const current = await getCreativeWorkLayerEditorOutput(input);
  const state = layerEditorStateFromDatabase(current?.layerEditor);
  if (!state || hasActiveLayerEditorRegeneration(state) || state.revision !== input.expectedRevision || state.lease?.id !== input.leaseId || state.lease.userId !== input.userId || Date.parse(state.lease.expiresAt) <= input.now.getTime()) return null;
  const next = applySnapshot(state, input.snapshot, input.now);
  if (!next) return null;
  const [row] = await db.update(creativeWorkOutputs).set({ layerEditor: next, updatedAt: input.now }).where(and(scope(input), sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(input.expectedRevision)}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt' = ${state.lease.expiresAt}`, sql`(${creativeWorkOutputs.layerEditor}->'regeneration' is null or ${creativeWorkOutputs.layerEditor}->'regeneration'->>'status' in ('failed', 'submission_unknown'))`)).returning();
  return row ?? null;
}

export async function releaseCreativeWorkLayerEditorLease(input: LayerEditorScope & { userId: string; leaseId: string; now?: Date }): Promise<boolean> {
  const result = await db.update(creativeWorkOutputs).set({ layerEditor: sql`jsonb_set(${creativeWorkOutputs.layerEditor}, '{lease}', 'null'::jsonb)`, updatedAt: input.now ?? new Date() }).where(and(scope(input), sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`)).returning({ id: creativeWorkOutputs.id });
  return result.length > 0;
}

export function layerEditorFromOutput(output: Output | null): LayerEditorStateV1 | null { return layerEditorStateFromDatabase(output?.layerEditor); }
export function layerizationFromOutput(output: Output | null): LayerizationState | null { return layerizationStateFromDatabase(output?.layerization); }

export async function reserveLayerRegeneration(input: LayerEditorMutationScope & { operationId: string; layerId: string; instruction: string; usageKey: string; now: Date }, executor: LayerEditorExecutor = db): Promise<Output | null> {
  const row = await getCreativeWorkLayerEditorOutput(input, executor); const state = layerEditorStateFromDatabase(row?.layerEditor);
  if (!state || state.revision !== input.expectedRevision || state.lease?.id !== input.leaseId || state.lease.userId !== input.userId || Date.parse(state.lease.expiresAt) <= input.now.getTime() || state.regeneration || !state.layers.some((layer) => layer.id === input.layerId)) return null;
  const next = { ...state, revision: state.revision + 1, regeneration: { id: input.operationId, status: "reserved" as const, layerId: input.layerId, instruction: input.instruction, requestedByUserId: input.userId, usageKey: input.usageKey, candidateKey: null, providerRequestId: null, failureCode: null, createdAt: input.now.toISOString(), updatedAt: input.now.toISOString() }, updatedAt: input.now.toISOString() };
  const [updated] = await executor.update(creativeWorkOutputs).set({ layerEditor: next, updatedAt: input.now }).where(and(scope(input), sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(input.expectedRevision)}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`, sql`${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt' = ${state.lease.expiresAt}`, sql`(${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt')::timestamptz > ${input.now.toISOString()}::timestamptz`, sql`${creativeWorkOutputs.layerEditor}->'regeneration' is null`)).returning(); return updated ?? null;
}
export async function rollbackReservedLayerRegeneration(input: LayerEditorScope & { operationId: string; now: Date }, executor: LayerEditorExecutor = db): Promise<Output | null> {
 const row=await getCreativeWorkLayerEditorOutput(input, executor); const state=layerEditorStateFromDatabase(row?.layerEditor);
 if(!state||state.regeneration?.id!==input.operationId||state.regeneration.status!=="reserved")return null;
 const next={...state,revision:state.revision+1,regeneration:null,updatedAt:input.now.toISOString()};
 const [updated]=await executor.update(creativeWorkOutputs).set({layerEditor:next,updatedAt:input.now}).where(and(scope(input),sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(state.revision)}`,...observedLeaseCas(state),sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'id' = ${input.operationId}`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'status' = 'reserved'`)).returning(); return updated??null;
}
export async function clearTerminalLayerRegenerationForRetry(input: LayerEditorMutationScope & { operationId: string; now: Date }, executor: LayerEditorExecutor = db): Promise<Output | null> {
 const row=await getCreativeWorkLayerEditorOutput(input, executor); const state=layerEditorStateFromDatabase(row?.layerEditor); const regeneration=state?.regeneration;
 if(!state||!regeneration||regeneration.id===input.operationId||(regeneration.status!=="failed"&&regeneration.status!=="submission_unknown")||state.revision!==input.expectedRevision||state.lease?.id!==input.leaseId||state.lease.userId!==input.userId||Date.parse(state.lease.expiresAt)<=input.now.getTime())return null;
 const next={...state,revision:state.revision+1,regeneration:null,updatedAt:input.now.toISOString()};
 const [updated]=await executor.update(creativeWorkOutputs).set({layerEditor:next,updatedAt:input.now}).where(and(scope(input),sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(input.expectedRevision)}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt' = ${state.lease.expiresAt}`,sql`(${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt')::timestamptz > ${input.now.toISOString()}::timestamptz`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'id' = ${regeneration.id}`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'status' in ('failed', 'submission_unknown')`)).returning(); return updated??null;
}
async function regenerationState(input: LayerEditorScope & { operationId: string; fromStatus: "reserved" | "processing"; status: "processing" | "ready" | "failed" | "submission_unknown"; candidateKey?: string; providerRequestId?: string | null; failureCode?: string; now: Date }) {
 const row=await getCreativeWorkLayerEditorOutput(input); const state=layerEditorStateFromDatabase(row?.layerEditor); if(!state||state.regeneration?.id!==input.operationId||state.regeneration.status!==input.fromStatus)return null;
 const regeneration={...state.regeneration,status:input.status,candidateKey:input.candidateKey??state.regeneration.candidateKey,providerRequestId:input.providerRequestId??state.regeneration.providerRequestId,failureCode:input.failureCode??null,updatedAt:input.now.toISOString()};
 // Do not rewrite the aggregate: heartbeat/release own the lease subtree and
 // may safely advance it while a worker performs this DB-only transition.
 const layerEditor = sql`jsonb_set(jsonb_set(jsonb_set(${creativeWorkOutputs.layerEditor}, '{revision}', ${JSON.stringify(state.revision + 1)}::jsonb), '{regeneration}', ${JSON.stringify(regeneration)}::jsonb), '{updatedAt}', ${JSON.stringify(input.now.toISOString())}::jsonb)`;
 const [updated]=await db.update(creativeWorkOutputs).set({layerEditor,updatedAt:input.now}).where(and(scope(input),sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(state.revision)}`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'id' = ${input.operationId}`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'status' = ${input.fromStatus}`)).returning(); return updated??null;
}
export const markLayerRegenerationProcessing=(input: LayerEditorScope & {operationId:string;now:Date})=>regenerationState({...input,fromStatus:"reserved",status:"processing"});
export const completeLayerRegenerationCandidate=(input: LayerEditorScope & {operationId:string;candidateKey:string;providerRequestId:string|null;now:Date})=>regenerationState({...input,fromStatus:"processing",status:"ready",candidateKey:input.candidateKey,providerRequestId:input.providerRequestId});
export const failLayerRegeneration=(input: LayerEditorScope & {operationId:string;status:"failed"|"submission_unknown";failureCode:string;now:Date})=>regenerationState({...input,fromStatus:"processing"});
export async function recoverStaleLayerRegeneration(input: LayerEditorScope & { now: Date }): Promise<Output | null> {
 const row = await getCreativeWorkLayerEditorOutput(input); const state = layerEditorStateFromDatabase(row?.layerEditor); const regeneration = state?.regeneration;
 if (!regeneration || regeneration.status !== "processing" || Date.parse(regeneration.updatedAt) > input.now.getTime() - LAYER_EDITOR_REGENERATION_PROCESSING_STALE_MS) return null;
 return regenerationState({ ...input, operationId: regeneration.id, fromStatus: "processing", status: "submission_unknown", failureCode: "layer_regeneration_submission_unknown", now: input.now });
}
export async function acceptLayerRegenerationCandidate(input: LayerEditorMutationScope & {operationId:string;immutableKey:string;now:Date}) { const row=await getCreativeWorkLayerEditorOutput(input); const state=layerEditorStateFromDatabase(row?.layerEditor); const regen=state?.regeneration; if(!state||!regen||state.lease?.id!==input.leaseId||state.lease.userId!==input.userId||Date.parse(state.lease.expiresAt)<=input.now.getTime()||regen.id!==input.operationId||regen.status!=="ready"||!regen.candidateKey)return null; const next={...state,revision:state.revision+1,layers:state.layers.map(l=>l.id===regen.layerId?{...l,currentKey:input.immutableKey,currentKind:"regenerated" as const,restorableKey:null}:l),regeneration:null,updatedAt:input.now.toISOString()}; const [updated]=await db.update(creativeWorkOutputs).set({layerEditor:next,updatedAt:input.now}).where(and(scope(input),sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(input.expectedRevision)}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt' = ${state.lease.expiresAt}`,sql`(${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt')::timestamptz > ${input.now.toISOString()}::timestamptz`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'id' = ${input.operationId}`)).returning(); return updated??null; }
export async function discardLayerRegenerationCandidate(input: LayerEditorMutationScope & {operationId:string;now:Date}) { const row=await getCreativeWorkLayerEditorOutput(input); const state=layerEditorStateFromDatabase(row?.layerEditor); const regeneration=state?.regeneration; if(!state||state.lease?.id!==input.leaseId||state.lease.userId!==input.userId||Date.parse(state.lease.expiresAt)<=input.now.getTime()||regeneration?.id!==input.operationId||regeneration.status!=="ready"||!regeneration.candidateKey)return null; const next={...state,revision:state.revision+1,regeneration:null,updatedAt:input.now.toISOString()}; const [updated]=await db.update(creativeWorkOutputs).set({layerEditor:next,updatedAt:input.now}).where(and(scope(input),sql`${creativeWorkOutputs.layerEditor}->>'revision' = ${String(input.expectedRevision)}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'id' = ${input.leaseId}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'userId' = ${input.userId}`,sql`${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt' = ${state.lease.expiresAt}`,sql`(${creativeWorkOutputs.layerEditor}->'lease'->>'expiresAt')::timestamptz > ${input.now.toISOString()}::timestamptz`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'id' = ${input.operationId}`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'status' = 'ready'`,sql`${creativeWorkOutputs.layerEditor}->'regeneration'->>'candidateKey' is not null`)).returning(); return updated??null; }

export async function publishCreativeWorkLayerEditorVersion(input: LayerEditorMutationScope & {
  parentOutputId: string;
  operationId: string;
  outputKey: string;
  psdKey: string;
  rebasedEditor: LayerEditorStateV1;
  now: Date;
}): Promise<{ output: Output; replay: boolean } | null> {
  const operationKey = layerEditorPublicationOperationKey(input);
  return db.transaction(async (tx) => {
    const [parent] = await tx.select().from(creativeWorkOutputs).where(and(
      scope({ ...input, outputId: input.parentOutputId }),
    )).for("update").limit(1);
    const state = layerEditorStateFromDatabase(parent?.layerEditor);
    if (!parent || !state || state.revision !== input.expectedRevision || state.lease?.id !== input.leaseId || state.lease.userId !== input.userId || Date.parse(state.lease.expiresAt) <= input.now.getTime() || hasActiveLayerEditorRegeneration(state)) return null;

    // The same client operation cannot publish through a different parent or
    // revision. This lock is deliberately wider than the parent-row lock.
    const operationScope = `${input.workspaceId}:${input.workItemId}:${input.operationId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${operationScope}))`);
    const operationPrefix = `layer-editor-publish:${input.operationId}:`;
    const [sameOperation] = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, input.workspaceId),
      eq(creativeWorkOutputs.workItemId, input.workItemId),
      sql`${creativeWorkOutputs.operationKey} like ${`${operationPrefix}%`}`,
    )).limit(1);
    if (sameOperation) {
      return sameOperation.operationKey === operationKey && sameOperation.parentOutputId === parent.id && sameOperation.outputKey === input.outputKey
        ? { output: sameOperation, replay: true }
        : null;
    }

    const versionScope = creativeWorkVersionLockScope({ workspaceId: input.workspaceId, workItemId: input.workItemId, creativeLevel: parent.creativeLevel, targetFormat: parent.targetFormat, directionId: parent.directionId });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${versionScope}))`);
    const [existing] = await tx.select().from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workspaceId, input.workspaceId),
      eq(creativeWorkOutputs.workItemId, input.workItemId),
      eq(creativeWorkOutputs.operationKey, operationKey),
    )).limit(1);
    if (existing) {
      return existing.parentOutputId === parent.id && existing.outputKey === input.outputKey
        ? { output: existing, replay: true }
        : null;
    }

    const [{ maxVersion }] = await tx.select({ maxVersion: max(creativeWorkOutputs.versionNumber) }).from(creativeWorkOutputs).where(and(
      eq(creativeWorkOutputs.workItemId, input.workItemId),
      eq(creativeWorkOutputs.creativeLevel, parent.creativeLevel),
      eq(creativeWorkOutputs.targetFormat, parent.targetFormat),
      ...(parent.directionId ? [eq(creativeWorkOutputs.directionId, parent.directionId)] : []),
    ));
    const [output] = await tx.insert(creativeWorkOutputs).values({
      workspaceId: input.workspaceId, workItemId: input.workItemId, creativeLevel: parent.creativeLevel, targetFormat: parent.targetFormat,
      versionNumber: (maxVersion ?? 0) + 1, parentOutputId: parent.id, operationKey, status: "completed", outputKey: input.outputKey,
      isSelected: false, quality: null, imageCallCount: 0, cost: null, directionId: parent.directionId, directionSnapshot: parent.directionSnapshot,
      layerEditor: input.rebasedEditor, queuedAt: input.now, terminalAt: input.now, generationCompletedAt: input.now,
    }).returning();
    return output ? { output, replay: false } : null;
  });
}

export function layerEditorPublicationOperationKey(input: Pick<LayerEditorMutationScope, "expectedRevision"> & { parentOutputId: string; operationId: string }) {
  return `layer-editor-publish:${input.operationId}:${input.parentOutputId}:${input.expectedRevision}`;
}

export async function findCreativeWorkLayerEditorPublicationByOperation(input: LayerEditorScope & { operationId: string }): Promise<Output | null> {
  const prefix = `layer-editor-publish:${input.operationId}:`;
  const [output] = await db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workspaceId, input.workspaceId),
    eq(creativeWorkOutputs.workItemId, input.workItemId),
    sql`${creativeWorkOutputs.operationKey} like ${`${prefix}%`}`,
  )).limit(1);
  return output ?? null;
}
