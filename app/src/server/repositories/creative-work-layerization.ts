import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { creativeWorkOutputs } from "@/server/db/schema";
import {
  layerizationStateFromDatabase,
  type LayerizationState,
  type LayerizationStatus,
} from "@/server/layerize/contracts";

type LayerizationOutputRow = typeof creativeWorkOutputs.$inferSelect;

function scope(workspaceId: string, workItemId: string, outputId: string) {
  return and(
    eq(creativeWorkOutputs.workspaceId, workspaceId),
    eq(creativeWorkOutputs.workItemId, workItemId),
    eq(creativeWorkOutputs.id, outputId),
  );
}

function withStatus(state: LayerizationState, status: LayerizationStatus, failureCode: LayerizationState["failureCode"] = null): LayerizationState {
  return { ...state, status, failureCode, updatedAt: new Date().toISOString() };
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
): Promise<LayerizationOutputRow | null> {
  const [row] = await db.select().from(creativeWorkOutputs).where(scope(workspaceId, workItemId, outputId)).limit(1);
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
}): Promise<LayerizationOutputRow | null> {
  const [row] = await db.update(creativeWorkOutputs).set({
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
}): Promise<boolean> {
  const result = await db.update(creativeWorkOutputs).set({
    layerization: null,
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'failed'`,
  )).returning({ id: creativeWorkOutputs.id });
  return result.length > 0;
}

export async function claimCreativeWorkLayerizationProcessing(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const row = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state) return null;
  const [claimed] = await db.update(creativeWorkOutputs).set({
    layerization: withStatus(state, "processing"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'queued'`,
  )).returning();
  return claimed ?? null;
}

export async function recordCreativeWorkLayerizationProviderRequest(
  workspaceId: string,
  workItemId: string,
  outputId: string,
  requestId: string,
): Promise<LayerizationOutputRow | null> {
  const row = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state) return null;
  if (state.providerRequestId) return row;
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: { ...state, providerRequestId: requestId, updatedAt: new Date().toISOString() },
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'providerRequestId' is null`,
  )).returning();
  if (updated) return updated;
  const refreshed = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  return refreshed ?? row;
}

export async function markCreativeWorkLayerizationReconciling(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const row = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state) return null;
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: withStatus(state, "reconciling"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
  )).returning();
  return updated ?? row;
}

export async function updateCreativeWorkLayerizationState(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  state: LayerizationState;
}): Promise<LayerizationOutputRow | null> {
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: input.state,
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
  const row = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state) return null;
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: withStatus(state, "submission_unknown", "submission_unknown"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'providerRequestId' is null`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
  )).returning();
  return updated ?? row;
}

export async function acceptCreativeWorkLayerizationCallback(input: {
  workItemId: string;
  outputId: string;
  attemptId: string;
  token: string;
  requestId?: string;
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
  if (state.status === "completed" || state.status === "failed" || state.status === "submission_unknown" || state.status === "finalizing") {
    return { accepted: false, replay: true, row };
  }
  if (state.callbackConsumedAt) return { accepted: false, replay: true, row };
  const next = {
    ...withStatus(state, "processing"),
    callbackConsumedAt: new Date().toISOString(),
    providerRequestId: state.providerRequestId ?? input.requestId ?? null,
  } satisfies LayerizationState;
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: next,
    updatedAt: new Date(),
  }).where(and(
    eq(creativeWorkOutputs.workItemId, input.workItemId),
    eq(creativeWorkOutputs.id, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
  )).returning();
  return updated
    ? { accepted: true, replay: false, row: updated }
    : { accepted: false, replay: true, row };
}

export async function claimCreativeWorkLayerizationFinalization(
  workspaceId: string,
  workItemId: string,
  outputId: string,
): Promise<LayerizationOutputRow | null> {
  const row = await getCreativeWorkLayerizationOutput(workspaceId, workItemId, outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state) return null;
  const [claimed] = await db.update(creativeWorkOutputs).set({
    layerization: withStatus(state, "finalizing"),
    updatedAt: new Date(),
  }).where(and(
    scope(workspaceId, workItemId, outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('processing', 'reconciling')`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
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
    layerization: withStatus(input.state, "completed"),
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' = 'finalizing'`,
  )).returning();
  return row ?? null;
}

export async function failCreativeWorkLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  code: LayerizationState["failureCode"];
}): Promise<LayerizationOutputRow | null> {
  const row = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId);
  const state = layerizationStateFromDatabase(row?.layerization);
  if (!row || !state || !input.code) return null;
  const [updated] = await db.update(creativeWorkOutputs).set({
    layerization: withStatus(state, "failed", input.code),
    updatedAt: new Date(),
  }).where(and(
    scope(input.workspaceId, input.workItemId, input.outputId),
    sql`${creativeWorkOutputs.layerization}->>'status' in ('queued', 'processing', 'reconciling', 'finalizing')`,
    sql`${creativeWorkOutputs.layerization}->>'callbackConsumedAt' is null`,
  )).returning();
  return updated ?? row;
}
