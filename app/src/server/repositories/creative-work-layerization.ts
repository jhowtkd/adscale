import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { creativeWorkOutputs } from "@/server/db/schema";
import {
  LAYERIZATION_RECOVERY_LEASE_MS,
  LAYERIZATION_CALLBACK_TTL_MS,
  layerizationStateFromDatabase,
  type LayerizationState,
  type LayerizationStatus,
} from "@/server/layerize/contracts";

type LayerizationOutputRow = typeof creativeWorkOutputs.$inferSelect;
type LayerizationExecutor = Pick<typeof db, "select" | "update">;

function scope(workspaceId: string, workItemId: string, outputId: string) {
  return and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
  );
}

function patchLayerizationState(patch: Partial<LayerizationState>) {
  return sql`${creativeWorkOutputs.layerization} || ${JSON.stringify(patch)}::jsonb`;
}

function patchLayerizationStatus(status: LayerizationStatus, failureCode: LayerizationState["failureCode"] = null) {
  return patchLayerizationState({ status, failureCode, updatedAt: new Date().toISOString() });
}

export function hashLayerizationCallbackToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function matchesLayerizationCallbackToken(token: string, tokenHash: string): boolean {
  const actual = Buffer.from(hashLayerizationCallbackToken(token), "utf8");
  const expected = Buffer.from(tokenHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getCreativeWorkLayerizationOutput(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  executor: Pick<LayerizationExecutor, "select"> = db,
): Promise<LayerizationOutputRow | null> {
  const [row] = await executor.select().from(creativeWorkOutputs).where(scope(workspaceId, workItemId, outputId)).limit(1);
  return row ?? null;
}

export async function getCreativeWorkLayerizationOutputById(
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const [row] = await db.select().from(creativeWorkOutputs).where(and(
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
  )).limit(1);
  return row ?? null;
}

export async function claimCreativeWorkLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  state: LayerizationState;
}, executor: Pick<LayerizationExecutor, "update"> = db): Promise<LayerizationOutputRow | null> {
  const [row] = await executor.update(creativeWorkOutputs).set({
    layerization: input.state,
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    eq(creativeWorkOutputs.status, "completed"),
    eq(creativeWorkOutputs.isSelected, true),
    isNotNull(creativeWorkOutputs.outputKey),
    isNull(creativeWorkOutputs.layerization),
  )).returning();
  return row ?? null;
}

export async function clearFailedCreativeWorkLayerizationForRetry(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}, executor: Pick<LayerizationExecutor, "update"> = db): Promise<boolean> {
  const result = await executor.update(creativeWorkOutputs).set({
    layerization: null,
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'failed'`,
  )).returning({ id: creativeWorkOutputs.id });
  return result.length > 0;
}

export async function isCreativeWorkOutputStillSelectedForLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}): Promise<boolean> {
  const [row] = await db.select({ id: creativeWorkOutputs.id }).from(creativeWorkOutputs).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    eq(creativeWorkOutputs.status, "completed"),
    eq(creativeWorkOutputs.isSelected, true),
    isNotNull(creativeWorkOutputs.outputKey),
  )).limit(1);
  return Boolean(row);
}

export async function claimCreativeWorkLayerizationProcessing(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const [claimed] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationStatus("processing"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'queued'`,
  )).returning();
  return claimed ?? null;
}

/** Extend only a matching queued attempt after its stable event is delivered. */
export async function refreshQueuedCreativeWorkLayerizationDispatch(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  attemptId: string;
  now: Date;
}, executor: Pick<LayerizationExecutor, "update"> = db): Promise<LayerizationOutputRow | null> {
  const updatedAt = input.now.toISOString();
  const callbackDeadlineAt = new Date(input.now.getTime() + LAYERIZATION_CALLBACK_TTL_MS).toISOString();
  const [updated] = await executor.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({ updatedAt, callbackDeadlineAt }),
    updatedAt: input.now,
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'queued'`,
    sql`${creativeWorkOutputs.layerization}->>'attemptId' = ${input.attemptId}`,
  )).returning();
  return updated ?? null;
}

export async function recordCreativeWorkLayerizationProviderRequest(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  requestId: string,
): Promise<LayerizationOutputRow | null> {
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({ providerRequestId: requestId, updatedAt: new Date().toISOString() }),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'providerRequestId' is null`,
  )).returning();
  if (updated) return updated;
  const refreshed = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  return refreshed ?? null;
}

export async function markCreativeWorkLayerizationReconciling(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationStatus("reconciling"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling')`,
  )).returning();
  if (updated) return updated;
  return getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
}

export async function updateCreativeWorkLayerizationState(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  state: LayerizationState;
}): Promise<LayerizationOutputRow | null> {
  const { state } = input;
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({
      estimatedCostUsd: state.estimatedCostUsd,
      latencyMs: state.latencyMs,
      baseWidth: state.baseWidth,
      baseHeight: state.baseHeight,
      layers: state.layers,
      fidelity: state.fidelity,
      updatedAt: state.updatedAt,
    }),
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling', 'finalizing')`,
  )).returning();
  return updated ?? null;
}

export async function markCreativeWorkLayerizationSubmissionUnknown(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationStatus("submission_unknown", "submission_unknown"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'providerRequestId' is null`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
  )).returning();
  if (updated) return updated;
  return getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
}

export async function claimExpiredCreativeWorkLayerizationRecovery(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  now: Date;
}, executor: Pick<LayerizationExecutor, "update"> = db): Promise<LayerizationOutputRow | null> {
  const now = input.now.toISOString();
  const leaseBefore = new Date(input.now.getTime() - LAYERIZATION_RECOVERY_LEASE_MS).toISOString();
  const [claimed] = await executor.update(creativeWorkOutputs).set({
    layerization: sql`${creativeWorkOutputs.layerization} || jsonb_build_object(
      'status', case
        when ${creativeWorkOutputs.layerization}->>'providerRequestId' is null then 'submission_unknown'
        else 'reconciling'
      end,
      'failureCode', case when ${creativeWorkOutputs.layerization}->>'providerRequestId' is null then 'submission_unknown' else null end,
      'updatedAt', ${now}::text
    )`,
    updatedAt: input.now,
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`(
      (
        ${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling')
        and (${creativeWorkOutputs.layerization}->>'callbackDeadlineAt')::timestamptz <= ${now}::timestamptz
      )
      or ${creativeWorkOutputs.layerization}->>'status' = 'finalizing'
    )`,
    sql`(${creativeWorkOutputs.layerization}->>'updatedAt')::timestamptz <= ${leaseBefore}::timestamptz`,
  )).returning();
  return claimed ?? null;
}

export async function releaseCreativeWorkLayerizationRecoveryLease(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  attemptId: string;
  claimedAt: string;
  now: Date;
}): Promise<boolean> {
  const retryAt = new Date(input.now.getTime() - LAYERIZATION_RECOVERY_LEASE_MS).toISOString();
  const released = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({ updatedAt: retryAt }),
    updatedAt: input.now,
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'attemptId' = ${input.attemptId}`,
    sql`${creativeWorkOutputs.layerization}->>'updatedAt' = ${input.claimedAt}`,
    sql`${creativeWorkOutputs.layerization}->>'status' in ('reconciling', 'finalizing')`,
  )).returning({ id: creativeWorkOutputs.id });
  return released.length > 0;
}

export async function acceptCreativeWorkLayerizationCallback(input: {
  workItemId: string;
  outputId: string;
  attemptId: string;
  token: string;
  requestId: string;
}): Promise<{ accepted: boolean; replay: boolean; row: LayerizationOutputRow | null }> {
  const row = await getCreativeWorkLayerizationOutputById(input.workItemId, input.outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state) return { accepted: false, replay: false, row: null };
  if (!matchesLayerizationCallbackToken(input.token, state.callbackTokenHash)) {
    return { accepted: false, replay: false, row };
  }
  if (state.attemptId !== input.attemptId) {
    return { accepted: false, replay: false, row };
  }
  if (Date.parse(state.callbackDeadlineAt) <= Date.now()) {
    return { accepted: false, replay: false, row };
  }
  if (state.status === "completed" || state.status === "failed" || state.status === "finalizing") {
    return { accepted: false, replay: true, row };
  }
  if (state.callbackConsumedAt) return { accepted: false, replay: true, row };
  if (state.providerRequestId && state.providerRequestId !== input.requestId) {
    return { accepted: false, replay: false, row };
  }
  const callbackConsumedAt = new Date().toISOString();
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({
      status: "processing",
      failureCode: null,
      callbackConsumedAt,
      providerRequestId: input.requestId,
      updatedAt: callbackConsumedAt,
    }),
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workItemId, input.workItemId),
    eq(creativeWorkOutputs.id, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling', 'submission_unknown')`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
    sql`(${creativeWorkOutputs.layerization}->>'providerRequestId' is null or ${creativeWorkOutputs.layerization}->>'providerRequestId' = ${input.requestId})`,
  )).returning();
  return updated
    ? { accepted: true, replay: false, row: updated }
    : { accepted: false, replay: true, row };
}

export async function claimCreativeWorkLayerizationFinalization(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  now = new Date(),
): Promise<LayerizationOutputRow | null> {
  const leaseBefore = new Date(now.getTime() - LAYERIZATION_RECOVERY_LEASE_MS).toISOString();
  const [claimed] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({ status: "finalizing", failureCode: null, updatedAt: now.toISOString() }),
    updatedAt: now,
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`(
      ${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling')
      or (
        ${creativeWorkOutputs.layerization}->>'status' = 'finalizing'
        and (${creativeWorkOutputs.layerization}->>'updatedAt')::timestamptz <= ${leaseBefore}::timestamptz
      )
    )`,
  )).returning();
  return claimed ?? null;
}

export async function completeCreativeWorkLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  state: LayerizationState;
}): Promise<LayerizationOutputRow | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
    layerization: patchLayerizationState({
      status: "completed",
      failureCode: null,
      psdKey: input.state.psdKey,
      diagnosticZipKey: input.state.diagnosticZipKey,
      updatedAt: new Date().toISOString(),
    }),
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'finalizing'`,
  )).returning();
  return row ?? null;
}

export async function failQueuedCreativeWorkLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  attemptId: string;
  code: LayerizationState["failureCode"];
}, executor: Pick<LayerizationExecutor, "update"> = db): Promise<LayerizationOutputRow | null> {
  const [updated] = await executor.update(creativeWorkOutputs).set({
    layerization: patchLayerizationStatus("failed", input.code),
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'queued'`,
    sql`${creativeWorkOutputs.layerization}->>'attemptId' = ${input.attemptId}`,
  )).returning();
  return updated ?? null;
}

export async function failCreativeWorkLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  code: LayerizationState["failureCode"];
}, executor: LayerizationExecutor = db): Promise<LayerizationOutputRow | null> {
  const [updated] = await executor.update(creativeWorkOutputs).set({
    layerization: patchLayerizationStatus("failed", input.code),
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling', 'finalizing')`,
  )).returning();
  if (updated) return updated;
  return getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId, executor);
}
