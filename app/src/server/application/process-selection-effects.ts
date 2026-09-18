/**
 * Selection-effect recovery processor (ICE-03B, spec #383 §ICE-03).
 *
 * Pending obligations converge on their own with durable confirmation:
 * claim with a short transaction and skippable lock, bounded lease, owner
 * comparison on close, database clock governing leases. Automatic retries
 * cover transient failures only, up to the dead state.
 *
 * The processor never generates images, charges, re-approves or selects
 * another output: it replays the same strict idempotent sinks as the
 * selection command. Repeat application yields the same logical change —
 * at-least-once with idempotent effects and durable confirmation.
 */
import { db } from "../db";
import { getCreativeWork } from "../repositories/creative-work";
import {
  claimSelectionEffects,
  closeSelectionEffect,
  type SelectionEffectKind,
  type SelectionEffectPayload,
} from "../repositories/selection-effects";
import {
  applyLibrarySelectionEffect,
  applyRecipeSelectionEffect,
  applyValueEventSelectionEffect,
} from "./selection-effect-sinks";

/** Batch claim limit: default 25, hard maximum 100 (spec). */
export const PROCESSOR_BATCH_DEFAULT = 25;
export const PROCESSOR_BATCH_MAX = 100;
/** Wake-up event the selection command emits post-commit (best effort). */
export const SELECTION_EFFECTS_WAKEUP_EVENT = "creative-work.selection.effects.wakeup";
/** Periodic paged sweep recovers lost wake-ups; the outbox stays authoritative. */
export const SELECTION_EFFECTS_SWEEP_CRON = "*/5 * * * *";
export const SELECTION_EFFECTS_SWEEP_MAX_PAGES = 4;
/** Claim lease in seconds, computed on the database clock. */
export const PROCESSOR_LEASE_SECONDS = 300;
/** One inline attempt plus one immediate retry plus five scheduled. */
export const MAX_EFFECT_ATTEMPTS = 7;
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

export function clampBatchLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? Number.NaN)) return PROCESSOR_BATCH_DEFAULT;
  return Math.min(PROCESSOR_BATCH_MAX, Math.max(1, Math.trunc(limit as number)));
}

const PERMANENT_CODE_PATTERNS = [
  "unauthorized",
  "forbidden",
  "auth_",
  "invalid_campaign",
  "cross_workspace",
  "cross-association",
  "owned_elsewhere",
  "ownership_conflict",
  "invalid_payload",
  "work_not_found",
  "output_not_found",
  "output_not_selected",
  "output_missing_key",
  "raster_only",
  "unsupported_layout",
  "missing_logo_geometry",
  "missing_font",
  "brand_required",
  "effect_canceled",
  "scope_gone",
];

const TRANSIENT_CODE_PATTERNS = [
  "timeout",
  "timedout",
  "timed_out",
  "econnreset",
  "etimedout",
  "eai_again",
  "econnrefused",
  "socket_hang_up",
  "fetch_failed",
  "temporarily_unavailable",
  "http_500",
  "http_502",
  "http_503",
  "http_504",
  "pool_timeout",
  "too_many_clients",
  "deadlock_detected",
  "serialization_failure",
  "connection_terminated",
  "server_closed_connection",
];

export interface ClassifiedEffectError {
  transient: boolean;
  code: string;
}

/**
 * Classify a sink failure. Authorization, cross-association and ownership
 * conflicts are never transient; timeouts, resets and 5xx are. Unknown
 * failures retry within the bounded schedule — they surface as dead with
 * their sanitized code instead of looping silently.
 */
export function classifyEffectError(cause: unknown): ClassifiedEffectError {
  const raw =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code: unknown }).code)
      : "effect_failed";
  const code = raw.slice(0, 120) || "effect_failed";
  const lowered = code.toLowerCase();
  if (PERMANENT_CODE_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return { transient: false, code };
  }
  if (TRANSIENT_CODE_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return { transient: true, code };
  }
  const message =
    cause instanceof Error ? cause.message.toLowerCase() : "";
  if (TRANSIENT_CODE_PATTERNS.some((pattern) => pattern.length > 4 && message.includes(pattern))) {
    return { transient: true, code };
  }
  return { transient: true, code };
}

export type EffectRetryPlan =
  | { state: "pending"; delayMs: 0 }
  | { state: "retry_wait"; delayMs: number }
  | { state: "dead" };

/**
 * Retry schedule by attempt count (attempt 1 runs inline in the command):
 * first processor pickup is immediate, then 30s/2min/10min/30min/2h,
 * then dead. Attempts beyond the maximum stay dead.
 */
export function planEffectRetry(attempts: number): EffectRetryPlan {
  if (attempts >= MAX_EFFECT_ATTEMPTS) return { state: "dead" };
  if (attempts <= 1) return { state: "pending", delayMs: 0 };
  return { state: "retry_wait", delayMs: RETRY_DELAYS_MS[attempts - 2] };
}

export interface ClaimedSelectionEffect {
  id: string;
  workspaceId: string;
  workItemId: string;
  outputId: string;
  kind: SelectionEffectKind;
  effectVersion: number;
  payload: SelectionEffectPayload;
  /** Attempts including the claim that produced this row. */
  attempts: number;
  /** Approval time from the outbox row: sinks cohort on it, never on processing time. */
  requestedAt: Date;
}

export interface EffectScope {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  outputKey: string;
}

export interface EffectSinkContext {
  effect: ClaimedSelectionEffect;
  scope: EffectScope;
}

export type EffectResolution =
  | { outcome: "done" }
  | { outcome: "retry"; delayMs: number; code: string }
  | { outcome: "dead"; code: string }
  | { outcome: "canceled"; code: string };

export interface EffectProcessorDeps {
  owner: string;
  limit?: number;
  claim: (limit: number) => Promise<ClaimedSelectionEffect[]>;
  loadScope: (effect: ClaimedSelectionEffect) => Promise<EffectScope | null>;
  sinks: Record<SelectionEffectKind, (ctx: EffectSinkContext) => Promise<unknown>>;
  /**
   * Owner-guarded close. `closed: false` means the lease moved on (or the
   * row is gone): the caller replays later or stops silently — never
   * resurrects, never throws for a ghost.
   */
  close: (id: string, resolution: EffectResolution, owner: string) => Promise<{ closed: boolean }>;
}

export type EffectProcessResult = {
  effectId: string;
  status: "done" | "retry_scheduled" | "dead" | "canceled" | "lease_lost";
};

function payloadRef(payload: SelectionEffectPayload, key: string): unknown {
  return (payload as unknown as Record<string, unknown>)[key];
}

/**
 * Payload cross-check before any sink runs: kind/version must match the
 * row, and the authorized references must be present. Anything else dies
 * without a retry — the row is corrupt, not unlucky.
 */
export function validateEffectPayload(effect: ClaimedSelectionEffect): boolean {
  const payload = effect.payload;
  if (!payload || typeof payload !== "object") return false;
  if (payloadRef(payload, "kind") !== effect.kind) return false;
  if (typeof payloadRef(payload, "version") !== "number") return false;
  switch (effect.kind) {
    case "library":
      return typeof payloadRef(payload, "outputKey") === "string" && payloadRef(payload, "outputKey") !== "";
    case "value_event":
      return (
        typeof payloadRef(payload, "eventKey") === "string" &&
        typeof payloadRef(payload, "userId") === "string" &&
        typeof payloadRef(payload, "protocol") === "string" &&
        typeof payloadRef(payload, "creativeWorkId") === "string" &&
        typeof payloadRef(payload, "outputKey") === "string"
      );
    case "recipe":
      return typeof payloadRef(payload, "receiptId") === "string" && payloadRef(payload, "receiptId") !== "";
    default:
      return false;
  }
}

export async function processSelectionEffects(
  deps: EffectProcessorDeps,
): Promise<EffectProcessResult[]> {
  const claimed = await deps.claim(clampBatchLimit(deps.limit));
  const results: EffectProcessResult[] = [];
  for (const effect of claimed) {
    const scope = await deps.loadScope(effect);
    if (!scope) {
      // Parent gone (cascade normally removes the row first): cancel the
      // remainder without recreating anything.
      await deps.close(effect.id, { outcome: "canceled", code: "scope_gone" }, deps.owner);
      results.push({ effectId: effect.id, status: "canceled" });
      continue;
    }
    if (scope.workspaceId !== effect.workspaceId || scope.outputId !== effect.outputId) {
      const closed = await deps.close(
        effect.id,
        { outcome: "dead", code: "ownership_conflict" },
        deps.owner,
      );
      results.push({ effectId: effect.id, status: closed.closed ? "dead" : "lease_lost" });
      continue;
    }
    if (!validateEffectPayload(effect)) {
      const closed = await deps.close(
        effect.id,
        { outcome: "dead", code: "invalid_payload" },
        deps.owner,
      );
      results.push({ effectId: effect.id, status: closed.closed ? "dead" : "lease_lost" });
      continue;
    }
    // The frozen request must reference the live output key: replaying a
    // stale payload against a different piece would corrupt the sinks.
    const payloadKey = payloadRef(effect.payload, "outputKey");
    if (typeof payloadKey === "string" && payloadKey !== scope.outputKey) {
      const closed = await deps.close(
        effect.id,
        { outcome: "dead", code: "ownership_conflict" },
        deps.owner,
      );
      results.push({ effectId: effect.id, status: closed.closed ? "dead" : "lease_lost" });
      continue;
    }
    try {
      await deps.sinks[effect.kind]({ effect, scope });
    } catch (cause) {
      const classified = classifyEffectError(cause);
      if (!classified.transient) {
        const closed = await deps.close(
          effect.id,
          { outcome: "dead", code: classified.code },
          deps.owner,
        );
        results.push({ effectId: effect.id, status: closed.closed ? "dead" : "lease_lost" });
        continue;
      }
      const plan = planEffectRetry(effect.attempts);
      if (plan.state === "dead") {
        const closed = await deps.close(
          effect.id,
          { outcome: "dead", code: classified.code },
          deps.owner,
        );
        results.push({ effectId: effect.id, status: closed.closed ? "dead" : "lease_lost" });
        continue;
      }
      const closed = await deps.close(
        effect.id,
        { outcome: "retry", delayMs: plan.delayMs, code: classified.code },
        deps.owner,
      );
      results.push({ effectId: effect.id, status: closed.closed ? "retry_scheduled" : "lease_lost" });
      continue;
    }
    const closed = await deps.close(effect.id, { outcome: "done" }, deps.owner);
    // Sink applied but the lease moved on (concurrent claim, expired lease,
    // crash before ack): the idempotent sink replays on the next claim.
    // The row is never marked done without the owner comparison.
    results.push({ effectId: effect.id, status: closed.closed ? "done" : "lease_lost" });
  }
  return results;
}

/**
 * Production wiring: database claim/close, live scope load, shared sinks.
 * One call processes a single batch; the wake-up function and the sweep
 * call it repeatedly (paged) until no claims remain.
 */
export async function runSelectionEffectsProcessor(input: {
  owner: string;
  limit?: number;
}): Promise<EffectProcessResult[]> {
  return processSelectionEffects({
    owner: input.owner,
    limit: input.limit,
    claim: (limit) =>
      claimSelectionEffects(db, {
        owner: input.owner,
        limit,
        leaseSeconds: PROCESSOR_LEASE_SECONDS,
      }),
    loadScope: async (effect) => {
      const existing = await getCreativeWork(effect.workspaceId, effect.workItemId);
      const output = existing?.outputs.find((row) => row.id === effect.outputId);
      if (!existing || !output?.outputKey) return null;
      return {
        workspaceId: effect.workspaceId,
        workItemId: effect.workItemId,
        outputId: output.id,
        outputKey: output.outputKey,
      };
    },
    sinks: {
      library: async ({ effect }) => {
        const payload = effect.payload;
        if (payload.kind !== "library") throw new Error("sink_kind_mismatch");
        await applyLibrarySelectionEffect({
          workspaceId: effect.workspaceId,
          outputKey: payload.outputKey,
          theme: payload.theme,
          creativeLevel: payload.creativeLevel,
        });
      },
      value_event: async ({ effect }) => {
        const payload = effect.payload;
        if (payload.kind !== "value_event") throw new Error("sink_kind_mismatch");
        await applyValueEventSelectionEffect({
          kind: "approved",
          userId: payload.userId,
          workspaceId: effect.workspaceId,
          creativeWorkId: payload.creativeWorkId,
          outputId: effect.outputId,
          outputKey: payload.outputKey,
          protocol: payload.protocol,
          origin: payload.origin,
          campaignId: payload.campaignId,
          clientProfileId: payload.clientProfileId,
          occurredAt: effect.requestedAt,
        });
      },
      recipe: async ({ effect }) => {
        const payload = effect.payload;
        if (payload.kind !== "recipe") throw new Error("sink_kind_mismatch");
        await applyRecipeSelectionEffect({
          workspaceId: effect.workspaceId,
          workItemId: effect.workItemId,
          outputId: effect.outputId,
          receiptId: payload.receiptId,
        });
      },
    },
    close: (id, resolution, owner) => closeSelectionEffect(db, { id, owner, resolution }),
  });
}

/**
 * Paged sweep until no claims remain (or the page cap hits): each pass
 * claims the next batch, so a lost wake-up converges within one sweep.
 */
export async function runSelectionEffectsSweep(input: {
  owner: string;
  limit?: number;
  maxPages?: number;
  runBatch?: (owner: string, limit: number) => Promise<EffectProcessResult[]>;
}): Promise<{ processed: number; pages: number }> {
  const runBatch =
    input.runBatch ?? ((owner, limit) => runSelectionEffectsProcessor({ owner, limit }));
  const maxPages = input.maxPages ?? SELECTION_EFFECTS_SWEEP_MAX_PAGES;
  const limit = clampBatchLimit(input.limit);
  let processed = 0;
  let pages = 0;
  for (;;) {
    const results = await runBatch(input.owner, limit);
    processed += results.length;
    pages += 1;
    if (results.length < limit || pages >= maxPages) break;
  }
  return { processed, pages };
}

export interface SelectionEffectsWakeup {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}

/**
 * Best-effort wake-up after the selection commit. Without an event key
 * there is no queue to wake (unit tests, keyless environments) — the
 * sweep recovers those rows. Failures never fail the selection: the
 * outbox, not the wake-up event, is the authority.
 */
export async function wakeSelectionEffectsProcessor(wakeup: SelectionEffectsWakeup): Promise<void> {
  if (!process.env.INNGEST_EVENT_KEY) return;
  try {
    const { inngest } = await import("../jobs/client");
    await inngest.send({ name: SELECTION_EFFECTS_WAKEUP_EVENT, data: { ...wakeup } });
  } catch {
    // Sweep backstop covers the lost wake-up; selection already committed.
  }
}
