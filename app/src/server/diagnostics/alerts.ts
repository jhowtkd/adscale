/**
 * Read-only diagnostic alert rules (jhowtkd/adscale#397).
 *
 * Pure evaluators over journal aggregates, canonical repo state and
 * journal/AI-tracer stats. Four rules from spec #382 (via loss-taxonomy.md):
 * terminal-failure rate, stalled queue/operation, missing expected events,
 * and telemetry drop/discard.
 *
 * Hard rules:
 * - Evaluation is import-side pure: repo SELECTs plus in-memory stats only.
 *   Nothing here touches generation, settlement, retry, lease or Inngest
 *   behavior — alerts observe, they never remediate.
 * - Cohorts never mix: every alert is keyed by (protocol, environment,
 *   dataOrigin). Production, staging, synthetic and test stay separate.
 *   Per-row grouping (terminal cohorts) splits by the stored cohort
 *   columns. Deployment-scoped queries (stalled operations, funnel
 *   comparison) cannot filter by cohort — outputs carry no cohort
 *   columns — so they count workspace-wide and label results with the
 *   caller-supplied DEPLOYMENT cohort, which identifies the evaluating
 *   deployment, never a filter. Do not read a deployment cohort as a
 *   per-cohort claim.
 * - No workItemId/user IDs in alert fields or log labels — aggregates only.
 * - Emission goes through the single-capture path only, capture-first:
 *   one `captureExceptionOnce` per alert, then one structured console log
 *   carrying the SAME Error object — shared dedup keeps the log
 *   console-only, so a warn-with-headline never auto-forwards a second
 *   `captureMessage` incident (#406 trap).
 * - Threshold proposals are DATA (adjustable without code-shape changes);
 *   tests pin the proposed values so changes are deliberate.
 */

import { and, gte, lt, sql } from "drizzle-orm";

import { captureExceptionOnce, logger } from "../../lib/logger";
import { db } from "../db";
import { creativeWorkOutputs, diagnosticEvents } from "../db/schema";
import {
  isDiagnosticDataOrigin,
  type DiagnosticDataOrigin,
} from "./contract";
import type { DiagnosticDatabase } from "./journal";

// ---------------------------------------------------------------------------
// Threshold proposals (adjustable data, not frozen contract)
// ---------------------------------------------------------------------------

/** Terminal-failure proposal mirroring spec #382: >=10% failed over >=20 completed. */
export const TERMINAL_FAILURE_ALERT_PROPOSAL = {
  minTerminals: 5,
  minCompleted: 20,
  rate: 0.1,
  windowMin: 15,
} as const;

export type TerminalFailureAlertParams = {
  minTerminals: number;
  minCompleted: number;
  rate: number;
  windowMin: number;
};

/**
 * Stall proposal calibrated from the real generation leases in
 * `app/src/app/api/creative-work/[id]/route.ts` (queued 60 min,
 * processing 10 min) — never an arbitrary tripwire. Read-only: the
 * evaluator only compares ages. (The route's 5-minute lease governs the
 * `creative_work_sources` table, not output statuses — a sources-stall
 * rule would need its own query and is out of scope here.)
 */
export const STALLED_OPERATION_ALERT_PROPOSAL = {
  queuedLeaseMs: 60 * 60 * 1000,
  processingLeaseMs: 10 * 60 * 1000,
} as const;

export type StalledOperationAlertParams = {
  queuedLeaseMs: number;
  processingLeaseMs: number;
};

/** Missing-expected-events proposal: >=20% of canonical terminals absent from the journal. */
export const MISSING_EVENTS_ALERT_PROPOSAL = {
  minCanonicalTerminals: 10,
  missingRatio: 0.2,
  windowMin: 15,
} as const;

export type MissingEventsAlertParams = {
  minCanonicalTerminals: number;
  missingRatio: number;
  windowMin: number;
};

/** Telemetry-drop proposal: any newly observed loss since the last evaluation. */
export const TELEMETRY_DROP_ALERT_PROPOSAL = {
  minNewDrops: 1,
} as const;

export type TelemetryDropAlertParams = {
  minNewDrops: number;
};

// ---------------------------------------------------------------------------
// Emergency-stderr patterns (log-based alerting signal)
// ---------------------------------------------------------------------------

/** Static prefix of journal emergency lines (journal.ts reportJournalFailure). */
export const DIAGNOSTIC_JOURNAL_EMERGENCY_PREFIX = "[diagnostic-journal]";

/** Static prefix of AI-tracing emergency lines (observability.ts reportAiTracingFailure). */
export const AI_TRACING_EMERGENCY_PREFIX = "[ai-tracing]";

/**
 * Pure matcher for the emergency-stderr telemetry-loss signal. Both prefixes
 * share the static suffix "; telemetry affected, generation unaffected".
 */
export function matchesEmergencyTelemetryPattern(line: unknown): boolean {
  if (typeof line !== "string") return false;
  return (
    line.includes(DIAGNOSTIC_JOURNAL_EMERGENCY_PREFIX) ||
    line.includes(AI_TRACING_EMERGENCY_PREFIX)
  );
}

// ---------------------------------------------------------------------------
// Alert shapes
// ---------------------------------------------------------------------------

export const DIAGNOSTIC_ALERT_RULES = [
  "terminal_failure_rate",
  "stalled_operation",
  "missing_expected_events",
  "telemetry_drop",
] as const;

export type DiagnosticAlertRule = (typeof DIAGNOSTIC_ALERT_RULES)[number];

/** Cohort key. Aggregates only — never a workItemId or user ID. */
export interface DiagnosticAlertCohort {
  protocol: string;
  environment: string;
  dataOrigin: DiagnosticDataOrigin;
}

export type DiagnosticAlertSeverity = "warn" | "error";

export const DIAGNOSTIC_ALERT_SEVERITY: Record<
  DiagnosticAlertRule,
  DiagnosticAlertSeverity
> = {
  terminal_failure_rate: "error",
  stalled_operation: "warn",
  missing_expected_events: "warn",
  telemetry_drop: "warn",
};

export interface DiagnosticAlert {
  rule: DiagnosticAlertRule;
  severity: DiagnosticAlertSeverity;
  cohort: DiagnosticAlertCohort;
  observed: Record<string, number>;
  threshold: Record<string, number>;
  sampleSize: number;
  evaluatedAt: string;
}

export type InsufficientSampleReason = "insufficient_sample" | "no_baseline";

export interface DiagnosticAlertInsufficient {
  rule: DiagnosticAlertRule;
  cohort: DiagnosticAlertCohort;
  reason: InsufficientSampleReason;
  sampleSize: number;
  minimum: number;
  evaluatedAt: string;
}

function evaluatedNow(evaluatedAt?: string): string {
  return evaluatedAt ?? new Date().toISOString();
}

function cohortKey(cohort: DiagnosticAlertCohort): string {
  return `${cohort.protocol}\n${cohort.environment}\n${cohort.dataOrigin}`;
}

function clampCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Rule 1: terminal-failure rate
// ---------------------------------------------------------------------------

export type TerminalCohortSample = DiagnosticAlertCohort & {
  terminals: number;
  completed: number;
  failed: number;
};

export interface TerminalFailureEvaluation {
  alerts: DiagnosticAlert[];
  insufficient: DiagnosticAlertInsufficient[];
}

/**
 * Pure terminal-failure evaluation. Windows below either minimum are
 * flagged as insufficient (never zeroed); rate = failed / completed.
 */
export function evaluateTerminalFailureRate(
  samples: TerminalCohortSample[],
  params: TerminalFailureAlertParams = TERMINAL_FAILURE_ALERT_PROPOSAL,
  evaluatedAt?: string,
): TerminalFailureEvaluation {
  const at = evaluatedNow(evaluatedAt);
  const alerts: DiagnosticAlert[] = [];
  const insufficient: DiagnosticAlertInsufficient[] = [];
  for (const sample of samples) {
    const cohort: DiagnosticAlertCohort = {
      protocol: sample.protocol,
      environment: sample.environment,
      dataOrigin: sample.dataOrigin,
    };
    const terminals = clampCount(sample.terminals);
    const completed = clampCount(sample.completed);
    const failed = clampCount(sample.failed);
    if (completed < params.minCompleted) {
      insufficient.push({
        rule: "terminal_failure_rate",
        cohort,
        reason: "insufficient_sample",
        sampleSize: completed,
        minimum: params.minCompleted,
        evaluatedAt: at,
      });
      continue;
    }
    if (terminals < params.minTerminals) {
      insufficient.push({
        rule: "terminal_failure_rate",
        cohort,
        reason: "insufficient_sample",
        sampleSize: terminals,
        minimum: params.minTerminals,
        evaluatedAt: at,
      });
      continue;
    }
    const failureRate = completed === 0 ? 0 : roundRate(failed / completed);
    if (failureRate >= params.rate) {
      alerts.push({
        rule: "terminal_failure_rate",
        severity: DIAGNOSTIC_ALERT_SEVERITY.terminal_failure_rate,
        cohort,
        observed: { failureRate, failed, completed, terminals },
        threshold: {
          failureRate: params.rate,
          minCompleted: params.minCompleted,
          minTerminals: params.minTerminals,
        },
        sampleSize: completed,
        evaluatedAt: at,
      });
    }
  }
  return { alerts, insufficient };
}

// ---------------------------------------------------------------------------
// Rule 2: stalled queue/operation
// ---------------------------------------------------------------------------

export const STALLED_OPERATION_STATES = [
  "queued",
  "processing",
] as const;

export type StalledOperationState = (typeof STALLED_OPERATION_STATES)[number];

export type StalledOperationSample = DiagnosticAlertCohort & {
  state: StalledOperationState;
  /** Milliseconds since the operation entered `state` (or last activity). */
  ageMs: number;
  /**
   * Optional queue wait (entered -> started) in ms, computed by the caller
   * (see `creativeWorkQueueWaitMs` in job-telemetry.ts). A wait beyond the
   * queued lease is stall evidence even after processing started.
   */
  queueWaitMs?: number;
};

function leaseForState(
  state: StalledOperationState,
  params: StalledOperationAlertParams,
): number {
  switch (state) {
    case "queued":
      return params.queuedLeaseMs;
    case "processing":
      return params.processingLeaseMs;
  }
}

/**
 * Pure stall evaluation. One alert per stalled cohort (aggregates only —
 * never one alert per operation). Strictly-greater comparison: an age
 * exactly at the lease is not stalled yet.
 */
export function evaluateStalledOperations(
  samples: StalledOperationSample[],
  params: StalledOperationAlertParams = STALLED_OPERATION_ALERT_PROPOSAL,
  evaluatedAt?: string,
): DiagnosticAlert[] {
  const at = evaluatedNow(evaluatedAt);
  const stalledByCohort = new Map<string, { cohort: DiagnosticAlertCohort; count: number; maxAgeMs: number }>();
  for (const sample of samples) {
    const ageMs = Number.isFinite(sample.ageMs) ? Math.max(0, sample.ageMs) : 0;
    const queueWaitMs =
      sample.queueWaitMs !== undefined && Number.isFinite(sample.queueWaitMs)
        ? Math.max(0, sample.queueWaitMs)
        : undefined;
    const stalled =
      ageMs > leaseForState(sample.state, params) ||
      (queueWaitMs !== undefined && queueWaitMs > params.queuedLeaseMs);
    if (!stalled) continue;
    const key = cohortKey(sample);
    const existing = stalledByCohort.get(key);
    if (existing) {
      existing.count += 1;
      existing.maxAgeMs = Math.max(existing.maxAgeMs, ageMs);
    } else {
      stalledByCohort.set(key, {
        cohort: {
          protocol: sample.protocol,
          environment: sample.environment,
          dataOrigin: sample.dataOrigin,
        },
        count: 1,
        maxAgeMs: ageMs,
      });
    }
  }
  return [...stalledByCohort.values()]
    .sort((a, b) => (cohortKey(a.cohort) < cohortKey(b.cohort) ? -1 : 1))
    .map((entry) => ({
      rule: "stalled_operation" as const,
      severity: DIAGNOSTIC_ALERT_SEVERITY.stalled_operation,
      cohort: entry.cohort,
      observed: { stalledCount: entry.count, maxAgeMs: entry.maxAgeMs },
      threshold: {
        queuedLeaseMs: params.queuedLeaseMs,
        processingLeaseMs: params.processingLeaseMs,
      },
      sampleSize: entry.count,
      evaluatedAt: at,
    }));
}

// ---------------------------------------------------------------------------
// Rule 3: missing expected events
// ---------------------------------------------------------------------------

/**
 * Deployment-scoped funnel counts. Both sides count workspace-wide in the
 * window — the canonical side cannot filter by cohort (no cohort columns
 * on outputs) and the journal side is intentionally unfiltered so the two
 * stay comparable. The cohort fields are the caller-supplied DEPLOYMENT
 * label (which deployment was evaluated), never a per-cohort filter claim.
 */
export type FunnelComparisonSample = DiagnosticAlertCohort & {
  canonicalTerminals: number;
  journalTerminals: number;
};

export interface MissingEventsEvaluation {
  alerts: DiagnosticAlert[];
  insufficient: DiagnosticAlertInsufficient[];
}

/**
 * Pure journal-vs-canonical-funnel comparison. Fires when canonical work
 * reached a terminal state but the matching journal terminals are missing
 * beyond the ratio — a telemetry gap, never a generation verdict.
 */
export function evaluateMissingExpectedEvents(
  samples: FunnelComparisonSample[],
  params: MissingEventsAlertParams = MISSING_EVENTS_ALERT_PROPOSAL,
  evaluatedAt?: string,
): MissingEventsEvaluation {
  const at = evaluatedNow(evaluatedAt);
  const alerts: DiagnosticAlert[] = [];
  const insufficient: DiagnosticAlertInsufficient[] = [];
  for (const sample of samples) {
    const cohort: DiagnosticAlertCohort = {
      protocol: sample.protocol,
      environment: sample.environment,
      dataOrigin: sample.dataOrigin,
    };
    const canonical = clampCount(sample.canonicalTerminals);
    const journal = clampCount(sample.journalTerminals);
    if (canonical < params.minCanonicalTerminals) {
      insufficient.push({
        rule: "missing_expected_events",
        cohort,
        reason: "insufficient_sample",
        sampleSize: canonical,
        minimum: params.minCanonicalTerminals,
        evaluatedAt: at,
      });
      continue;
    }
    const missing = Math.max(0, canonical - journal);
    const missingRatio = roundRate(missing / canonical);
    if (missing > 0 && missingRatio >= params.missingRatio) {
      alerts.push({
        rule: "missing_expected_events",
        severity: DIAGNOSTIC_ALERT_SEVERITY.missing_expected_events,
        cohort,
        observed: {
          missing,
          missingRatio,
          canonicalTerminals: canonical,
          journalTerminals: journal,
        },
        threshold: {
          missingRatio: params.missingRatio,
          minCanonicalTerminals: params.minCanonicalTerminals,
        },
        sampleSize: canonical,
        evaluatedAt: at,
      });
    }
  }
  return { alerts, insufficient };
}

// ---------------------------------------------------------------------------
// Rule 4: telemetry drop/discard
// ---------------------------------------------------------------------------

/** Loss-counter snapshot. Subset of journal + AI-tracer stats (loss signals only). */
export interface TelemetryLossSnapshot {
  journalDroppedEvents: number;
  journalFailedFlushes: number;
  aiTracingDroppedSpans: number;
  aiTracingFailedFlushes: number;
}

export interface TelemetryDropEvaluation {
  alerts: DiagnosticAlert[];
  insufficient: DiagnosticAlertInsufficient[];
}

/**
 * Pure telemetry-loss evaluation over two snapshots. Counters are
 * cumulative per process lifetime, so only INCREASES since the previous
 * snapshot fire. Without a previous snapshot there is no baseline: nothing
 * fires and the cohort is reported with `no_baseline`.
 */
export function evaluateTelemetryDrops(
  cohort: DiagnosticAlertCohort,
  current: TelemetryLossSnapshot,
  previous?: TelemetryLossSnapshot,
  params: TelemetryDropAlertParams = TELEMETRY_DROP_ALERT_PROPOSAL,
  evaluatedAt?: string,
): TelemetryDropEvaluation {
  const at = evaluatedNow(evaluatedAt);
  if (!previous) {
    return {
      alerts: [],
      insufficient: [
        {
          rule: "telemetry_drop",
          cohort,
          reason: "no_baseline",
          sampleSize: 0,
          minimum: 1,
          evaluatedAt: at,
        },
      ],
    };
  }
  const signals: Array<{ key: string; current: number; previous: number }> = [
    { key: "journal.droppedEvents", current: current.journalDroppedEvents, previous: previous.journalDroppedEvents },
    { key: "journal.failedFlushes", current: current.journalFailedFlushes, previous: previous.journalFailedFlushes },
    { key: "aiTracing.droppedSpans", current: current.aiTracingDroppedSpans, previous: previous.aiTracingDroppedSpans },
    { key: "aiTracing.failedFlushes", current: current.aiTracingFailedFlushes, previous: previous.aiTracingFailedFlushes },
  ];
  const observed: Record<string, number> = {};
  let totalNew = 0;
  for (const signal of signals) {
    const cur = clampCount(signal.current);
    const prev = clampCount(signal.previous);
    const fresh = Math.max(0, cur - prev);
    if (fresh >= params.minNewDrops) {
      observed[signal.key] = fresh;
      totalNew += fresh;
    }
  }
  if (totalNew === 0) return { alerts: [], insufficient: [] };
  return {
    alerts: [
      {
        rule: "telemetry_drop",
        severity: DIAGNOSTIC_ALERT_SEVERITY.telemetry_drop,
        cohort,
        observed,
        threshold: { minNewDrops: params.minNewDrops },
        sampleSize: totalNew,
        evaluatedAt: at,
      },
    ],
    insufficient: [],
  };
}

// ---------------------------------------------------------------------------
// Read-only queries (new SELECTs only — never modify existing hot paths)
// ---------------------------------------------------------------------------

export interface AlertWindow {
  since: Date;
  until: Date;
  /**
   * Optional workspace scope (e.g. the OBSERVABILITY_WORKSPACE_ALLOWLIST
   * during staged rollout). Omitted = deployment-wide evaluation.
   */
  workspaceIds?: string[];
}

/**
 * Journal terminal aggregates grouped by the stored cohort columns. Only
 * rows with a known dataOrigin are returned — unknown origins cannot be
 * cohorted and are excluded (never guessed).
 */
export async function queryTerminalCohortSamples(
  window: AlertWindow,
  database: DiagnosticDatabase = db,
): Promise<TerminalCohortSample[]> {
  const sinceWallClock = toUtcWallClock(window.since);
  const untilWallClock = toUtcWallClock(window.until);
  const conditions = [
    gte(sql`${diagnosticEvents.occurredAt}`, sinceWallClock),
    lt(sql`${diagnosticEvents.occurredAt}`, untilWallClock),
  ];
  if (window.workspaceIds !== undefined && window.workspaceIds.length > 0) {
    conditions.push(
      sql`${diagnosticEvents.workspaceId} in (${sql.join(
        window.workspaceIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }
  const rows = await database
    .select({
      protocol: diagnosticEvents.protocol,
      environment: diagnosticEvents.environment,
      dataOrigin: diagnosticEvents.dataOrigin,
      terminals: sql<string>`count(*) filter (where ${diagnosticEvents.event} in ('operation.completed', 'operation.failed'))::text`,
      completed: sql<string>`count(*) filter (where ${diagnosticEvents.event} = 'operation.completed')::text`,
      failed: sql<string>`count(*) filter (where ${diagnosticEvents.event} = 'operation.failed')::text`,
    })
    .from(diagnosticEvents)
    .where(and(...conditions))
    .groupBy(
      diagnosticEvents.protocol,
      diagnosticEvents.environment,
      diagnosticEvents.dataOrigin,
    );
  const samples: TerminalCohortSample[] = [];
  for (const row of rows) {
    if (!isDiagnosticDataOrigin(row.dataOrigin)) continue;
    samples.push({
      protocol: row.protocol,
      environment: row.environment,
      dataOrigin: row.dataOrigin,
      terminals: Number.parseInt(row.terminals, 10),
      completed: Number.parseInt(row.completed, 10),
      failed: Number.parseInt(row.failed, 10),
    });
  }
  return samples;
}

export interface StalledOperationQueryInput {
  now: Date;
  /**
   * Deployment cohort supplied by the caller: canonical output rows carry
   * no protocol/environment/dataOrigin columns, so stall evaluation is
   * deployment-scoped, never per-row cohorted.
   */
  cohort: DiagnosticAlertCohort;
  /** Optional workspace scope (see AlertWindow.workspaceIds). */
  workspaceIds?: string[];
}

/**
 * Read-only stall input: queued/processing outputs with their ages. Queued
 * age counts from `queued_at`; processing age counts from `updated_at` as
 * the last-activity proxy. Pure SELECT — zero coupling to the failStale,
 * requeue, heartbeat and settlement paths.
 */
export async function queryStalledOperationSamples(
  input: StalledOperationQueryInput,
  database: DiagnosticDatabase = db,
): Promise<StalledOperationSample[]> {
  const stalledConditions = [
    sql`${creativeWorkOutputs.status} in ('queued', 'processing')`,
  ];
  if (input.workspaceIds !== undefined && input.workspaceIds.length > 0) {
    stalledConditions.push(
      sql`${creativeWorkOutputs.workspaceId} in (${sql.join(
        input.workspaceIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  const rows = await database
    .select({
      status: creativeWorkOutputs.status,
      queuedAt: creativeWorkOutputs.queuedAt,
      updatedAt: creativeWorkOutputs.updatedAt,
    })
    .from(creativeWorkOutputs)
    .where(and(...stalledConditions));
  const nowMs = input.now.getTime();
  return rows.map((row) => {
    const state: StalledOperationState =
      row.status === "processing" ? "processing" : "queued";
    const reference = state === "processing" ? row.updatedAt : row.queuedAt;
    const ageMs = Math.max(0, nowMs - reference.getTime());
    const sample: StalledOperationSample = {
      ...input.cohort,
      state,
      ageMs,
    };
    if (state === "processing") {
      sample.queueWaitMs = Math.max(
        0,
        row.updatedAt.getTime() - row.queuedAt.getTime(),
      );
    }
    return sample;
  });
}

export interface FunnelComparisonQueryInput extends AlertWindow {
  /**
   * Deployment cohort supplied by the caller: labels which deployment was
   * evaluated. Not a filter — counts are deployment-scoped (see
   * FunnelComparisonSample). Never label mixed counts with a production
   * cohort.
   */
  cohort: DiagnosticAlertCohort;
}

/**
 * Read-only funnel comparison: canonical terminal outputs vs journal
 * terminal events in the window. Canonical timing uses
 * `coalesce(terminal_at, updated_at)` — rows that reached a terminal
 * status without a terminal timestamp still count. Pure SELECTs.
 */
/**
 * UTC wall-clock (`YYYY-MM-DD HH:MM:SS`) for every window predicate against
 * the tz-naive `timestamp` columns, which store UTC wall-clock by
 * convention. Use it in RAW `sql` fragments only: drizzle's column-mapped
 * predicates require `Date` values (`mapToDriverValue` calls
 * `.toISOString()`), while a `Date` inside a raw fragment is rendered by
 * node-postgres in the PROCESS local timezone — and a `Z` ISO string
 * compares against naive columns through the PG SESSION timezone. Both
 * silently shift the window off-UTC; naive UTC strings in raw fragments
 * are the only spelling independent of both. See trace-397 pg proof.
 */
export function toUtcWallClock(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

export async function queryFunnelComparison(
  input: FunnelComparisonQueryInput,
  database: DiagnosticDatabase = db,
): Promise<FunnelComparisonSample> {
  const sinceWallClock = toUtcWallClock(input.since);
  const untilWallClock = toUtcWallClock(input.until);
  const canonicalConditions = [
    sql`${creativeWorkOutputs.status} in ('completed', 'failed')`,
    gte(
      sql`coalesce(${creativeWorkOutputs.terminalAt}, ${creativeWorkOutputs.updatedAt})`,
      sinceWallClock,
    ),
    lt(
      sql`coalesce(${creativeWorkOutputs.terminalAt}, ${creativeWorkOutputs.updatedAt})`,
      untilWallClock,
    ),
  ];
  const journalConditions = [
    sql`${diagnosticEvents.event} in ('operation.completed', 'operation.failed')`,
    gte(sql`${diagnosticEvents.occurredAt}`, sinceWallClock),
    lt(sql`${diagnosticEvents.occurredAt}`, untilWallClock),
  ];
  if (input.workspaceIds !== undefined && input.workspaceIds.length > 0) {
    canonicalConditions.push(
      sql`${creativeWorkOutputs.workspaceId} in (${sql.join(
        input.workspaceIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
    journalConditions.push(
      sql`${diagnosticEvents.workspaceId} in (${sql.join(
        input.workspaceIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }
  const [canonicalRow] = await database
    .select({ count: sql<string>`count(*)::text` })
    .from(creativeWorkOutputs)
    .where(and(...canonicalConditions));
  const [journalRow] = await database
    .select({ count: sql<string>`count(*)::text` })
    .from(diagnosticEvents)
    .where(and(...journalConditions));
  return {
    ...input.cohort,
    canonicalTerminals: parseCount(canonicalRow?.count),
    journalTerminals: parseCount(journalRow?.count),
  };
}

function parseCount(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

// ---------------------------------------------------------------------------
// Emission (single-capture path only)
// ---------------------------------------------------------------------------

export interface EmitDiagnosticAlertsDeps {
  log?: (fields: Record<string, unknown>) => void;
  capture?: (
    error: unknown,
    context?: Record<string, unknown>,
    tags?: Record<string, string | number | boolean>,
  ) => void;
}

/**
 * Emit evaluated alerts: exactly one Sentry event per alert, capture-first.
 * `captureExceptionOnce` runs before the console log, and the log carries
 * the SAME Error object — the shared WeakSet dedup then keeps the log
 * console-only. (A warn record with a headline but no Error would
 * auto-forward a `captureMessage` AND the explicit capture would fire: the
 * #406 double incident. Capture-first with the shared object cannot pair.)
 * Never throws; emission failure must not break the evaluator host.
 */
export function emitDiagnosticAlerts(
  alerts: DiagnosticAlert[],
  deps: EmitDiagnosticAlertsDeps = {},
): void {
  const log =
    deps.log ??
    ((fields: Record<string, unknown>) => {
      logger.warn(fields);
    });
  const capture = deps.capture ?? captureExceptionOnce;
  for (const alert of alerts) {
    try {
      const fields: Record<string, unknown> = {
        event: "diagnostics.alert",
        rule: alert.rule,
        severity: alert.severity,
        protocol: alert.cohort.protocol,
        environment: alert.cohort.environment,
        dataOrigin: alert.cohort.dataOrigin,
        observed: alert.observed,
        threshold: alert.threshold,
        sampleSize: alert.sampleSize,
        evaluatedAt: alert.evaluatedAt,
      };
      const error = new Error(
        `diagnostics alert: ${alert.rule} [${alert.cohort.protocol}/${alert.cohort.environment}/${alert.cohort.dataOrigin}]`,
      );
      capture(error, fields, {
        rule: alert.rule,
        protocol: alert.cohort.protocol,
        environment: alert.cohort.environment,
        dataOrigin: alert.cohort.dataOrigin,
      });
      log({ ...fields, error });
    } catch {
      // Emission must never break the host.
    }
  }
}
