import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkSelectionEffects,
  type CreativeWorkSelectionEffect,
  type DurableEffectState,
  type SelectionEffectKind,
  type SelectionEffectPayload,
} from "../db/schema";

type EffectExecutor = Pick<typeof db, "insert" | "select" | "update">;

export const SELECTION_EFFECT_VERSION = 1;
export type { CreativeWorkSelectionEffect, DurableEffectState, SelectionEffectKind, SelectionEffectPayload };

/**
 * Deterministic identity of one logical selection effect: workspace, piece,
 * effect type and effect version. Replays and retries converge on it, keeping
 * the original request date — never shifting cohort.
 */
export function selectionEffectIdempotencyKey(input: {
  workspaceId: string;
  outputId: string;
  kind: SelectionEffectKind;
  effectVersion: number;
}): string {
  return `se1:${input.workspaceId}:${input.outputId}:${input.kind}:v${input.effectVersion}`;
}

export type EnqueueSelectionEffectRequest = {
  kind: SelectionEffectKind;
  payload: SelectionEffectPayload;
  effectVersion?: number;
};

export type EnqueuedSelectionEffect = {
  kind: SelectionEffectKind;
  effect: CreativeWorkSelectionEffect;
  /** True when this call persisted the row; false on replay (existing row). */
  created: boolean;
};

/**
 * Enqueue obligations in the caller's executor — the selection transaction
 * passes its own tx, so an obligation failure rolls the selection back.
 * Concurrent enqueues of the same obligation converge on one row via the
 * dedup constraint; the loser receives the winner's row.
 */
export async function enqueueSelectionEffects(
  executor: EffectExecutor,
  input: {
    workspaceId: string;
    workItemId: string;
    outputId: string;
    effects: EnqueueSelectionEffectRequest[];
    requestedAt: Date;
  },
): Promise<EnqueuedSelectionEffect[]> {
  const enqueued: EnqueuedSelectionEffect[] = [];
  for (const request of input.effects) {
    const effectVersion = request.effectVersion ?? SELECTION_EFFECT_VERSION;
    const [created] = await executor
      .insert(creativeWorkSelectionEffects)
      .values({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: input.outputId,
        kind: request.kind,
        effectVersion,
        idempotencyKey: selectionEffectIdempotencyKey({
          workspaceId: input.workspaceId,
          outputId: input.outputId,
          kind: request.kind,
          effectVersion,
        }),
        payload: request.payload,
        state: "pending",
        requestedAt: input.requestedAt,
      })
      .onConflictDoNothing({
        target: [
          creativeWorkSelectionEffects.workspaceId,
          creativeWorkSelectionEffects.outputId,
          creativeWorkSelectionEffects.kind,
          creativeWorkSelectionEffects.effectVersion,
        ],
      })
      .returning();
    if (created) {
      enqueued.push({ kind: request.kind, effect: created, created: true });
      continue;
    }
    const existing = await getSelectionEffect(executor, {
      workspaceId: input.workspaceId,
      outputId: input.outputId,
      kind: request.kind,
      effectVersion,
    });
    if (!existing) {
      throw new Error("selection_effect_conflict_without_row");
    }
    enqueued.push({ kind: request.kind, effect: existing, created: false });
  }
  return enqueued;
}

export async function getSelectionEffect(
  executor: EffectExecutor,
  input: {
    workspaceId: string;
    outputId: string;
    kind: SelectionEffectKind;
    effectVersion: number;
  },
): Promise<CreativeWorkSelectionEffect | null> {
  const [row] = await executor
    .select()
    .from(creativeWorkSelectionEffects)
    .where(and(
      eq(creativeWorkSelectionEffects.workspaceId, input.workspaceId),
      eq(creativeWorkSelectionEffects.outputId, input.outputId),
      eq(creativeWorkSelectionEffects.kind, input.kind),
      eq(creativeWorkSelectionEffects.effectVersion, input.effectVersion),
    ))
    .limit(1);
  return row ?? null;
}

export async function getSelectionEffectsForOutput(
  executor: EffectExecutor,
  input: { workspaceId: string; workItemId: string; outputId: string },
): Promise<CreativeWorkSelectionEffect[]> {
  return executor
    .select()
    .from(creativeWorkSelectionEffects)
    .where(and(
      eq(creativeWorkSelectionEffects.workspaceId, input.workspaceId),
      eq(creativeWorkSelectionEffects.workItemId, input.workItemId),
      eq(creativeWorkSelectionEffects.outputId, input.outputId),
    ));
}

/**
 * Confirm a completed effect. Only a verified sink write may call this —
 * "done" requires a confirmed record, never a tolerant return.
 */
export async function markSelectionEffectDone(
  executor: EffectExecutor,
  input: { id: string; completedAt?: Date },
): Promise<void> {
  await executor
    .update(creativeWorkSelectionEffects)
    .set({
      state: "done",
      completedAt: input.completedAt ?? new Date(),
      errorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(creativeWorkSelectionEffects.id, input.id));
}

/**
 * Record a failed sync attempt without resolving the obligation: the row
 * stays pending for the recovery processor (ICE-03B). Error codes are
 * sanitized short strings, never raw payloads.
 */
export async function recordSelectionEffectAttempt(
  executor: EffectExecutor,
  input: { id: string; errorCode: string },
): Promise<void> {
  await executor
    .update(creativeWorkSelectionEffects)
    .set({
      attempts: sql`${creativeWorkSelectionEffects.attempts} + 1`,
      errorCode: input.errorCode.slice(0, 120),
      updatedAt: new Date(),
    })
    .where(eq(creativeWorkSelectionEffects.id, input.id));
}
