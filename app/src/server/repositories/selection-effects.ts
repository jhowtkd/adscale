import { and, eq, sql, type SQL } from "drizzle-orm";
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

export async function getSelectionEffectsForWork(
  executor: EffectExecutor,
  input: { workspaceId: string; workItemId: string },
): Promise<CreativeWorkSelectionEffect[]> {
  return executor
    .select()
    .from(creativeWorkSelectionEffects)
    .where(and(
      eq(creativeWorkSelectionEffects.workspaceId, input.workspaceId),
      eq(creativeWorkSelectionEffects.workItemId, input.workItemId),
    ));
}

/**
 * Raw-SQL executor for the recovery processor: claim uses SELECT FOR
 * UPDATE SKIP LOCKED plus database-clock leases, which the query builder
 * cannot express. Both `db` and transaction executors satisfy it.
 */
export interface SelectionEffectsProcessorExecutor {
  execute: (query: SQL<unknown>) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ClaimedSelectionEffectRow {
  id: string;
  workspaceId: string;
  workItemId: string;
  outputId: string;
  kind: SelectionEffectKind;
  effectVersion: number;
  payload: SelectionEffectPayload;
  attempts: number;
  /** Approval time: recovered effects keep the original cohort, never the processing time. */
  requestedAt: Date;
}

/**
 * Parse a tz-naive `timestamp` wall-clock (stored as UTC by convention)
 * into the correct instant in any process timezone. A bare
 * `new Date(naive)` parses in the PROCESS local timezone and shifts the
 * instant off-UTC. Already-zoned inputs pass through untouched.
 */
function parseUtcNaiveTimestamp(value: unknown): Date {
  if (value instanceof Date) return value;
  const text = String(value).trim().replace(" ", "T");
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  return new Date(`${text}Z`);
}

function mapClaimedRow(row: Record<string, unknown>): ClaimedSelectionEffectRow {
  const requestedAt = row.requested_at;
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    workItemId: String(row.work_item_id),
    outputId: String(row.output_id),
    kind: row.kind as SelectionEffectKind,
    effectVersion: Number(row.effect_version),
    payload: row.payload as SelectionEffectPayload,
    attempts: Number(row.attempts),
    requestedAt: parseUtcNaiveTimestamp(requestedAt),
  };
}

/**
 * Claim due obligations in one statement: pending rows, matured retries
 * and expired leases, oldest first, skipping rows locked by a concurrent
 * claimant. Attempts increment on claim, so each execution counts exactly
 * once even when the worker crashes mid-effect. The database clock
 * governs both the due comparison and the lease computation.
 */
export async function claimSelectionEffects(
  executor: SelectionEffectsProcessorExecutor,
  input: { owner: string; limit: number; leaseSeconds: number },
): Promise<ClaimedSelectionEffectRow[]> {
  const result = await executor.execute(sql`
    WITH claimed AS (
      SELECT effect.id
      FROM adscale_app.creative_work_selection_effects AS effect
      WHERE effect.state = 'pending'
         OR (effect.state = 'retry_wait' AND effect.next_attempt_at <= now())
         OR (effect.state = 'processing' AND effect.lease_expires_at <= now())
      ORDER BY effect.requested_at ASC, effect.id ASC
      LIMIT ${input.limit}
      FOR UPDATE OF effect SKIP LOCKED
    )
    UPDATE adscale_app.creative_work_selection_effects AS effect
    SET state = 'processing',
        lease_owner = ${input.owner},
        lease_expires_at = now() + make_interval(secs => ${input.leaseSeconds}),
        attempts = effect.attempts + 1,
        updated_at = now()
    FROM claimed
    WHERE effect.id = claimed.id
    RETURNING
      effect.id AS id,
      effect.workspace_id AS workspace_id,
      effect.work_item_id AS work_item_id,
      effect.output_id AS output_id,
      effect.kind AS kind,
      effect.effect_version AS effect_version,
      effect.payload AS payload,
      effect.attempts AS attempts,
      effect.requested_at AS requested_at
  `);
  return result.rows.map(mapClaimedRow);
}

export type CloseSelectionEffectResolution =
  | { outcome: "done" }
  | { outcome: "retry"; delayMs: number; code: string }
  | { outcome: "dead"; code: string }
  | { outcome: "canceled"; code: string };

/**
 * Owner-compared close: only the lease holder in `processing` state may
 * resolve the row. `closed: false` means the lease moved on or the row is
 * gone (cascade) — the caller replays later or stops silently, and never
 * resurrects the obligation.
 */
export async function closeSelectionEffect(
  executor: SelectionEffectsProcessorExecutor,
  input: { id: string; owner: string; resolution: CloseSelectionEffectResolution },
): Promise<{ closed: boolean }> {
  const { resolution } = input;
  const setClause =
    resolution.outcome === "done"
      ? sql`state = 'done', completed_at = now(), error_code = NULL,
            lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = NULL`
      : resolution.outcome === "retry" && resolution.delayMs > 0
        ? sql`state = 'retry_wait',
              next_attempt_at = now() + (${resolution.delayMs} * interval '1 millisecond'),
              error_code = ${resolution.code.slice(0, 120)},
              lease_owner = NULL, lease_expires_at = NULL`
        : resolution.outcome === "retry"
          ? sql`state = 'pending', next_attempt_at = NULL,
                error_code = ${resolution.code.slice(0, 120)},
                lease_owner = NULL, lease_expires_at = NULL`
          : resolution.outcome === "dead"
            ? sql`state = 'dead', error_code = ${resolution.code.slice(0, 120)},
                  lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = NULL`
            : sql`state = 'canceled', error_code = ${resolution.code.slice(0, 120)},
                  lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = NULL`;
  const result = await executor.execute(sql`
    UPDATE adscale_app.creative_work_selection_effects AS effect
    SET ${setClause}, updated_at = now()
    WHERE effect.id = ${input.id}
      AND effect.lease_owner = ${input.owner}
      AND effect.state = 'processing'
    RETURNING effect.id AS id
  `);
  return { closed: result.rows.length > 0 };
}
