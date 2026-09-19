/**
 * Pure presentation helpers for the Diagnóstico console tab.
 *
 * All derivation here (recovered vs terminal, time buckets) is UI-level and
 * operates only on measured `durationMs` values and stored timestamps —
 * clocks across processes are NOT comparable, so cross-process deltas are
 * never computed. A derivation bug here must never be mistaken for a
 * contract change in `src/server/diagnostics/contract.ts`.
 */

import type { DiagnosticEventEnvelopeMirror } from "./types";

/** Console time buckets for the operation/stage timeline. */
export type DiagnosticBucket =
  | "queue"
  | "ai"
  | "composition"
  | "evaluation"
  | "delivery"
  | "other";

export const DIAGNOSTIC_BUCKETS: readonly DiagnosticBucket[] = [
  "queue",
  "ai",
  "composition",
  "evaluation",
  "delivery",
] as const;

const FAILURE_EVENT_NAMES: ReadonlySet<string> = new Set([
  "operation.failed",
  "stage.failed",
  "model.call.failed",
  "model.validation.failed",
  "selection.effect.failed",
]);

const SUCCESS_EVENT_NAMES: ReadonlySet<string> = new Set([
  "operation.completed",
  "stage.completed",
  "model.call.completed",
  "selection.confirmed",
  "export.prepared",
  "export.served",
]);

export function isFailureEventName(name: string): boolean {
  return FAILURE_EVENT_NAMES.has(name);
}

export function isSuccessEventName(name: string): boolean {
  return SUCCESS_EVENT_NAMES.has(name);
}

/**
 * Map a journal stage to a console bucket. `selection`/`export` are the
 * human-wait tail of the journey; everything pre-image that is not queue
 * time maps to `other` rather than being misattributed. Note: the timeline
 * renders only the five named bucket rows — `other` has no bucket-total
 * row, but the individual event rows keep their own durations, so no
 * pre-image time is hidden.
 */
export function stageBucket(stage: string | null | undefined): DiagnosticBucket {
  switch (stage) {
    case "queue":
      return "queue";
    case "image":
      return "ai";
    case "composition":
      return "composition";
    case "quality":
      return "evaluation";
    case "selection":
    case "export":
      return "delivery";
    default:
      return "other";
  }
}

/**
 * Bucket for one event. Model-call and export/selection events win over the
 * stored stage so AI time and delivery time are attributed even when the
 * stage label is absent.
 */
export function eventBucket(
  event: Pick<DiagnosticEventEnvelopeMirror, "event" | "stage">,
): DiagnosticBucket {
  if (event.event.startsWith("model.")) return "ai";
  if (
    event.event.startsWith("export.") ||
    event.event.startsWith("selection.")
  ) {
    return "delivery";
  }
  return stageBucket(event.stage);
}

export interface BucketDuration {
  /** Sum of measured `durationMs` values only. */
  totalMs: number;
  measured: number;
  unmeasured: number;
}

export type BucketDurationMap = Record<DiagnosticBucket, BucketDuration>;

function emptyBucketDurations(): BucketDurationMap {
  return {
    queue: { totalMs: 0, measured: 0, unmeasured: 0 },
    ai: { totalMs: 0, measured: 0, unmeasured: 0 },
    composition: { totalMs: 0, measured: 0, unmeasured: 0 },
    evaluation: { totalMs: 0, measured: 0, unmeasured: 0 },
    delivery: { totalMs: 0, measured: 0, unmeasured: 0 },
    other: { totalMs: 0, measured: 0, unmeasured: 0 },
  };
}

/**
 * Sum measured durations per bucket. Events without `durationMs` count as
 * unmeasured — their wall time is displayed, never inferred.
 */
export function bucketDurations(
  events: readonly DiagnosticEventEnvelopeMirror[],
): BucketDurationMap {
  const totals = emptyBucketDurations();
  for (const event of events) {
    const bucket = eventBucket(event);
    if (typeof event.durationMs === "number") {
      totals[bucket].totalMs += event.durationMs;
      totals[bucket].measured += 1;
    } else {
      totals[bucket].unmeasured += 1;
    }
  }
  return totals;
}

export type OperationBadge =
  | "recovered"
  | "terminal"
  | "unconfirmed"
  | "partial";

export interface OperationSummary {
  operationId: string;
  /** Null when no event in the operation carried context. */
  releaseSha: string | null;
  eventCount: number;
  badges: OperationBadge[];
  buckets: BucketDurationMap;
}

/**
 * Group events by operation and classify each operation:
 * - `recovered`: a failure event followed (by occurrence) by a success
 *   event in the same operation and stage scope.
 * - `terminal`: a failure with no such recovery.
 * - `unconfirmed`: no failure and no confirmed completion.
 * - `partial`: any event observed without prior context.
 */
export function summarizeOperations(
  events: readonly DiagnosticEventEnvelopeMirror[],
): OperationSummary[] {
  const groups = new Map<string, DiagnosticEventEnvelopeMirror[]>();
  for (const event of events) {
    const operationId = event.context?.operationId ?? "";
    const list = groups.get(operationId);
    if (list) list.push(event);
    else groups.set(operationId, [event]);
  }

  const summaries: OperationSummary[] = [];
  for (const [operationId, group] of groups) {
    const ordered = [...group].sort((a, b) =>
      a.occurredAt < b.occurredAt
        ? -1
        : a.occurredAt > b.occurredAt
          ? 1
          : a.recordedAt < b.recordedAt
            ? -1
            : a.recordedAt > b.recordedAt
              ? 1
              : 0,
    );
    const seenFailureByScope = new Set<string>();
    let recovered = false;
    let hasFailure = false;
    let completed = false;
    let partial = false;
    let releaseSha: string | null = null;
    for (const event of ordered) {
      if (releaseSha === null && event.context?.releaseSha) {
        releaseSha = event.context.releaseSha;
      }
      if (event.correlation === "partial") partial = true;
      if (event.event === "operation.completed") completed = true;
      // Scope recovery to the event's stage so a failure in one stage is
      // not "recovered" by unrelated progress in another.
      const scope = event.stage ?? `event:${eventBucket(event)}`;
      if (isFailureEventName(event.event)) {
        hasFailure = true;
        seenFailureByScope.add(scope);
      } else if (
        isSuccessEventName(event.event) &&
        seenFailureByScope.has(scope)
      ) {
        recovered = true;
      }
    }
    const badges: OperationBadge[] = [];
    if (recovered) badges.push("recovered");
    else if (hasFailure) badges.push("terminal");
    else if (!completed) badges.push("unconfirmed");
    if (partial) badges.push("partial");
    summaries.push({
      operationId,
      releaseSha,
      eventCount: group.length,
      badges,
      buckets: bucketDurations(group),
    });
  }
  return summaries;
}

/** Distinct release SHAs across the given events, in first-seen order. */
export function releaseShas(
  events: readonly DiagnosticEventEnvelopeMirror[],
): string[] {
  const shas: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const sha = event.context?.releaseSha;
    if (sha && !seen.has(sha)) {
      seen.add(sha);
      shas.push(sha);
    }
  }
  return shas;
}

/** Distinct call ids across the given events, in first-seen order. */
export function callIds(
  events: readonly DiagnosticEventEnvelopeMirror[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const callId = event.call?.callId;
    if (callId && !seen.has(callId)) {
      seen.add(callId);
      ids.push(callId);
    }
  }
  return ids;
}
