/**
 * Persisted diagnostic event journal (jhowtkd/adscale#387).
 *
 * Queryable index of selected single-piece lifecycle events: bounded
 * in-memory buffer, background batched writes with dedup by eventId, and
 * cursor-paginated workspace-scoped reads. The canonical Trabalho state is
 * never read through this module — that is precisely why generation stays
 * readable whenever the index itself degrades.
 *
 * Hard rules (from spec #382, frozen values from ./contract):
 * - Write path NEVER throws and NEVER blocks command completion: invalid,
 *   oversize-unreducible and over-capacity events are dropped with a counter.
 * - One concurrent flush per journal; batches of at most 25; every batch
 *   write races a timeout; failures keep events buffered for the next flush.
 * - No prompt/response content columns; attributes are sanitized with the
 *   hardened redactTelemetry (#385) and bounded (count, key/value length).
 * - Reads are strictly workspace-scoped; cursors are opaque (occurredAt, id)
 *   tuples; limit defaults to 50 and clamps to 100.
 * - Context arrives as an explicit envelope field. This module never touches
 *   ambient propagation (#386 owns withDiagnosticContext).
 */

import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { redactTelemetry } from "../../lib/redact-telemetry";
import { db } from "../db";
import * as schema from "../db/schema";
import { diagnosticEvents, type NewDiagnosticEvent } from "../db/schema";
import {
  CONTENT_AVAILABILITY_STATES,
  DIAGNOSTIC_EXPORT_BUDGET,
  DIAGNOSTIC_SCHEMA_VERSION,
  isDiagnosticEventName,
  isDiagnosticEventStatus,
  isDiagnosticStage,
  type ContentAvailabilityState,
  type DiagnosticContext,
  type DiagnosticEventEnvelope,
  type EmitDiagnosticEvent,
  type EnqueueDiagnosticEvent,
  type FlushDiagnosticEvents,
  type ListDiagnosticEvents,
} from "./contract";

/** Default page size for journal reads (spec: 50). */
export const DIAGNOSTIC_JOURNAL_DEFAULT_LIMIT = 50;
/** Maximum page size for journal reads (spec: 100). */
export const DIAGNOSTIC_JOURNAL_MAX_LIMIT = 100;
/** Per-batch write timeout in ms (spec requires a timeout; value is local). */
export const DIAGNOSTIC_JOURNAL_WRITE_TIMEOUT_MS = 5_000;
/** Maximum sanitized attribute entries persisted per event. */
export const DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTES = 32;
/** Maximum attribute key length; longer keys are dropped. */
export const DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_KEY_LENGTH = 64;
/** Maximum string attribute value length; longer values are truncated. */
export const DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_VALUE_LENGTH = 512;
/** Marker left in place of attributes stripped by oversize reduction. */
export const DIAGNOSTIC_JOURNAL_REDUCED_MARKER = "oversize-attributes-dropped";

export type DiagnosticJournalErrorCode =
  | "INVALID_SCOPE"
  | "INVALID_CURSOR"
  | "INVALID_LIMIT";

/** Typed read-path failure. The write path never throws this (or anything). */
export class DiagnosticJournalError extends Error {
  readonly code: DiagnosticJournalErrorCode;

  constructor(code: DiagnosticJournalErrorCode, message: string) {
    super(message);
    this.name = "DiagnosticJournalError";
    this.code = code;
  }
}

/** Process-local, best-effort counters. Detectable loss, see loss-taxonomy.md. */
export interface DiagnosticJournalStats {
  bufferedEvents: number;
  bufferedBytes: number;
  droppedEvents: number;
  persistedEvents: number;
  duplicateEvents: number;
  failedFlushes: number;
  /** True once any loss was observed (drop, failed flush, timeout, shutdown). */
  degraded: boolean;
}

export interface PersistBatchResult {
  inserted: number;
  duplicates: number;
}

export type PersistBatch = (
  rows: NewDiagnosticEvent[],
) => Promise<PersistBatchResult>;

export type DiagnosticDatabase = NodePgDatabase<typeof schema>;

/**
 * Drizzle-backed batch writer with dedup by event identity: conflicting
 * eventIds are skipped (never error) and reported as duplicates.
 */
export function createDrizzlePersistBatch(
  database: DiagnosticDatabase,
): PersistBatch {
  return async (rows) => {
    if (rows.length === 0) {
      return { inserted: 0, duplicates: 0 };
    }
    const inserted = await database
      .insert(diagnosticEvents)
      .values(rows)
      .onConflictDoNothing({ target: diagnosticEvents.id })
      .returning({ id: diagnosticEvents.id });
    return { inserted: inserted.length, duplicates: rows.length - inserted.length };
  };
}

export interface DiagnosticJournalOptions {
  persistBatch?: PersistBatch;
  writeTimeoutMs?: number;
  maxBufferedEvents?: number;
  maxBufferedBytes?: number;
}

export interface DiagnosticJournal {
  enqueue(event: DiagnosticEventEnvelope): void;
  emit(event: DiagnosticEventEnvelope): Promise<void>;
  flush(): Promise<void>;
  stats(): DiagnosticJournalStats;
  start(): void;
  stop(): void;
  shutdown(timeoutMs: number): Promise<void>;
}

const EMERGENCY_WINDOW_MS = 60_000;
const EMERGENCY_MAX_PER_WINDOW = 5;
let emergencyWindowStart = 0;
let emergencyCount = 0;

/**
 * Rate-limited emergency output for journal-internal failures. Static
 * strings only — no event data, no recursion into the journal or logger.
 */
function reportJournalFailure(kind: string): void {
  try {
    const now = Date.now();
    if (now - emergencyWindowStart > EMERGENCY_WINDOW_MS) {
      emergencyWindowStart = now;
      emergencyCount = 0;
    }
    emergencyCount += 1;
    if (emergencyCount <= EMERGENCY_MAX_PER_WINDOW) {
      console.error(
        `[diagnostic-journal] ${kind}; telemetry affected, generation unaffected`,
      );
    }
  } catch {
    // The emergency path must never throw either.
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidContext(value: unknown): value is DiagnosticContext {
  if (!isPlainRecord(value)) return false;
  const context = value as Partial<DiagnosticContext>;
  return (
    context.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION &&
    isNonEmptyString(context.workspaceId) &&
    isNonEmptyString(context.workItemId) &&
    context.protocol === "single" &&
    isNonEmptyString(context.operationId) &&
    isNonEmptyString(context.releaseSha) &&
    isNonEmptyString(context.environment) &&
    (context.process === "web" || context.process === "worker") &&
    isNonEmptyString(context.dataOrigin)
  );
}

function isValidEnvelope(event: unknown): event is DiagnosticEventEnvelope {
  try {
    if (!isPlainRecord(event)) return false;
    const envelope = event as Partial<DiagnosticEventEnvelope>;
    return (
      isNonEmptyString(envelope.eventId) &&
      isDiagnosticEventName(envelope.event) &&
      envelope.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION &&
      isNonEmptyString(envelope.occurredAt) &&
      !Number.isNaN(Date.parse(envelope.occurredAt)) &&
      isNonEmptyString(envelope.recordedAt) &&
      !Number.isNaN(Date.parse(envelope.recordedAt)) &&
      isValidContext(envelope.context)
    );
  } catch {
    return false;
  }
}

/**
 * Sanitize + bound free-form attributes: redactTelemetry first (never
 * mutates the input, never throws), then keep the first 32 scalar entries
 * with bounded keys/values. Never throws.
 */
function sanitizeAttributes(
  input: unknown,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  try {
    const redacted: unknown = redactTelemetry(input);
    if (!isPlainRecord(redacted)) return out;
    for (const key of Object.keys(redacted)) {
      if (Object.keys(out).length >= DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTES) break;
      if (key.length === 0 || key.length > DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_KEY_LENGTH) {
        continue;
      }
      const value: unknown = redacted[key];
      if (value === null || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
      } else if (typeof value === "string") {
        out[key] =
          value.length > DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_VALUE_LENGTH
            ? value.slice(0, DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_VALUE_LENGTH)
            : value;
      }
      // Non-scalars are dropped: attributes hold scalars only by contract.
    }
  } catch {
    return {};
  }
  return out;
}

function toRow(
  event: DiagnosticEventEnvelope,
  attributes: Record<string, string | number | boolean | null>,
): NewDiagnosticEvent {
  const context = event.context as DiagnosticContext;
  return {
    id: event.eventId,
    workspaceId: context.workspaceId,
    clientProfileId: context.clientProfileId,
    workItemId: context.workItemId,
    protocol: context.protocol,
    operationId: context.operationId,
    parentOperationId: context.parentOperationId ?? null,
    generationCorrelationId: context.generationCorrelationId ?? null,
    outputId: context.outputId ?? null,
    attemptNumber: context.attemptNumber ?? null,
    event: event.event,
    stage: event.stage ?? null,
    status: event.status ?? null,
    correlation: event.correlation,
    occurredAt: new Date(event.occurredAt),
    recordedAt: new Date(event.recordedAt),
    durationMs: event.durationMs ?? null,
    callId: event.call?.callId ?? null,
    provider: event.call?.provider ?? null,
    requestedModel: event.call?.requestedModel ?? null,
    returnedModel: event.call?.returnedModel ?? null,
    providerRequestId: event.call?.providerRequestId ?? null,
    latencyMs: event.call?.latencyMs ?? null,
    inputTokens: event.call?.inputTokens ?? null,
    outputTokens: event.call?.outputTokens ?? null,
    errorClass: event.error?.errorClass ?? null,
    errorStatus: event.error?.status ?? null,
    errorReason: event.error?.reason ?? null,
    sentryEventId: event.externalRefs?.sentryEventId ?? null,
    inngestRunId:
      event.externalRefs?.inngestRunId ?? context.inngestRunId ?? null,
    langfuseTraceId: event.externalRefs?.langfuseTraceId ?? null,
    langfuseObservationId: event.externalRefs?.langfuseObservationId ?? null,
    contentAvailability: event.content?.availability ?? null,
    contentPolicyVersion: event.content?.policyVersion ?? null,
    releaseSha: context.releaseSha,
    environment: context.environment,
    process: context.process,
    dataOrigin: context.dataOrigin,
    attributes,
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
  };
}

function measureRowBytes(row: NewDiagnosticEvent): number {
  try {
    return Buffer.byteLength(JSON.stringify(row), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`diagnostic journal write timed out after ${ms}ms`));
    }, ms);
    if (typeof timer === "object" && typeof timer.unref === "function") {
      timer.unref();
    }
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface BufferedRow {
  row: NewDiagnosticEvent;
  bytes: number;
}

class DiagnosticJournalImpl implements DiagnosticJournal {
  private readonly persistBatch: PersistBatch;
  private readonly writeTimeoutMs: number;
  private readonly maxBufferedEvents: number;
  private readonly maxBufferedBytes: number;
  private buffer: BufferedRow[] = [];
  private bufferedIds = new Set<string>();
  private bufferedBytes = 0;
  private droppedEvents = 0;
  private persistedEvents = 0;
  private duplicateEvents = 0;
  private failedFlushes = 0;
  private inFlight: Promise<void> | null = null;
  private inFlightCount = 0;
  private discardRequeues = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DiagnosticJournalOptions = {}) {
    this.persistBatch =
      options.persistBatch ?? createDrizzlePersistBatch(db);
    this.writeTimeoutMs =
      options.writeTimeoutMs ?? DIAGNOSTIC_JOURNAL_WRITE_TIMEOUT_MS;
    this.maxBufferedEvents =
      options.maxBufferedEvents ?? DIAGNOSTIC_EXPORT_BUDGET.maxBufferedEvents;
    this.maxBufferedBytes =
      options.maxBufferedBytes ?? DIAGNOSTIC_EXPORT_BUDGET.maxBufferedBytes;
  }

  enqueue(event: DiagnosticEventEnvelope): void {
    try {
      if (!isValidEnvelope(event)) {
        this.droppedEvents += 1;
        reportJournalFailure("invalid-event-dropped");
        return;
      }
      let attributes = sanitizeAttributes(event.attributes);
      let row = toRow(event, attributes);
      if (measureRowBytes(row) > DIAGNOSTIC_EXPORT_BUDGET.maxEventBytes) {
        attributes = { "diagnostic.reduced": DIAGNOSTIC_JOURNAL_REDUCED_MARKER };
        row = toRow(event, attributes);
        if (measureRowBytes(row) > DIAGNOSTIC_EXPORT_BUDGET.maxEventBytes) {
          this.droppedEvents += 1;
          reportJournalFailure("oversize-event-dropped");
          return;
        }
        reportJournalFailure("oversize-event-reduced");
      }
      if (this.bufferedIds.has(row.id)) {
        this.duplicateEvents += 1;
        return;
      }
      const bytes = measureRowBytes(row);
      if (
        this.buffer.length >= this.maxBufferedEvents ||
        this.bufferedBytes + bytes > this.maxBufferedBytes
      ) {
        this.droppedEvents += 1;
        reportJournalFailure("buffer-full-event-dropped");
        return;
      }
      this.buffer.push({ row, bytes });
      this.bufferedIds.add(row.id);
      this.bufferedBytes += bytes;
    } catch {
      this.droppedEvents += 1;
      reportJournalFailure("enqueue-failed");
    }
  }

  async emit(event: DiagnosticEventEnvelope): Promise<void> {
    try {
      this.enqueue(event);
    } catch {
      // enqueue never throws; belt-and-braces so emit never rejects.
    }
    // The flush runs in the background: command completion never waits for it.
    void this.flush();
  }

  flush(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.runFlush().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  stats(): DiagnosticJournalStats {
    return {
      bufferedEvents: this.buffer.length,
      bufferedBytes: this.bufferedBytes,
      droppedEvents: this.droppedEvents,
      persistedEvents: this.persistedEvents,
      duplicateEvents: this.duplicateEvents,
      failedFlushes: this.failedFlushes,
      degraded: this.droppedEvents > 0 || this.failedFlushes > 0,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, DIAGNOSTIC_EXPORT_BUDGET.flushIntervalMs);
    if (
      this.timer &&
      typeof this.timer === "object" &&
      typeof this.timer.unref === "function"
    ) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async shutdown(timeoutMs: number): Promise<void> {
    this.stop();
    try {
      await withTimeout(this.flush(), Math.max(0, timeoutMs));
    } catch {
      // Budget exhausted: whatever is still buffered or in flight dies with
      // the process. Count it as dropped so the loss is detectable (see
      // loss-taxonomy.md); the abandoned flush discards instead of
      // requeueing so nothing is counted twice.
      const lost = this.buffer.length + this.inFlightCount;
      this.buffer = [];
      this.bufferedIds.clear();
      this.bufferedBytes = 0;
      this.inFlightCount = 0;
      this.discardRequeues = true;
      if (lost > 0) {
        this.droppedEvents += lost;
        reportJournalFailure("shutdown-unflushed-dropped");
      }
    }
  }

  private async runFlush(): Promise<void> {
    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.splice(0, DIAGNOSTIC_EXPORT_BUDGET.maxBatchEvents);
        for (const item of batch) {
          this.bufferedIds.delete(item.row.id);
          this.bufferedBytes -= item.bytes;
        }
        this.inFlightCount = batch.length;
        let result: PersistBatchResult;
        try {
          result = await withTimeout(
            this.persistBatch(batch.map((item) => item.row)),
            this.writeTimeoutMs,
          );
        } catch {
          // Keep the failed batch for the next flush; stop this one so a
          // down database does not burn a timeout per batch.
          this.failedFlushes += 1;
          this.inFlightCount = 0;
          if (this.discardRequeues) {
            return;
          }
          reportJournalFailure("flush-failed-batch-requeued");
          const restored = [...batch, ...this.buffer];
          this.buffer = [];
          this.bufferedIds.clear();
          this.bufferedBytes = 0;
          for (const item of restored) {
            if (
              this.buffer.length >= this.maxBufferedEvents ||
              this.bufferedBytes + item.bytes > this.maxBufferedBytes
            ) {
              this.droppedEvents += 1;
            } else {
              this.buffer.push(item);
              this.bufferedIds.add(item.row.id);
              this.bufferedBytes += item.bytes;
            }
          }
          return;
        }
        this.inFlightCount = 0;
        this.persistedEvents += result.inserted;
        this.duplicateEvents += result.duplicates;
      }
    } catch {
      this.failedFlushes += 1;
      reportJournalFailure("flush-failed");
    }
  }
}

export function createDiagnosticJournal(
  options: DiagnosticJournalOptions = {},
): DiagnosticJournal {
  return new DiagnosticJournalImpl(options);
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DIAGNOSTIC_JOURNAL_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new DiagnosticJournalError(
      "INVALID_LIMIT",
      `listDiagnosticEvents: limit must be a positive integer, got ${String(limit)}`,
    );
  }
  return Math.min(limit, DIAGNOSTIC_JOURNAL_MAX_LIMIT);
}

interface CursorPosition {
  occurredAt: Date;
  id: string;
}

function encodeCursor(row: { occurredAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify([row.occurredAt.toISOString(), row.id]),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor: string): CursorPosition {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      !Number.isNaN(Date.parse(parsed[0])) &&
      isNonEmptyString(parsed[1])
    ) {
      return { occurredAt: new Date(parsed[0]), id: parsed[1] };
    }
  } catch {
    // Fall through to the typed error below.
  }
  throw new DiagnosticJournalError(
    "INVALID_CURSOR",
    "listDiagnosticEvents: cursor is not a valid journal cursor",
  );
}

type DiagnosticEventRow = typeof diagnosticEvents.$inferSelect;

function toEnvelope(row: DiagnosticEventRow): DiagnosticEventEnvelope {
  const context: DiagnosticContext = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    workspaceId: row.workspaceId,
    clientProfileId: row.clientProfileId,
    workItemId: row.workItemId,
    protocol: "single",
    operationId: row.operationId,
    releaseSha: row.releaseSha,
    environment: row.environment,
    process: row.process === "worker" ? "worker" : "web",
    dataOrigin:
      row.dataOrigin === "production" ||
      row.dataOrigin === "staging" ||
      row.dataOrigin === "synthetic" ||
      row.dataOrigin === "test"
        ? row.dataOrigin
        : "production",
  };
  if (row.parentOperationId) context.parentOperationId = row.parentOperationId;
  if (row.generationCorrelationId) {
    context.generationCorrelationId = row.generationCorrelationId;
  }
  if (row.outputId) context.outputId = row.outputId;
  if (row.inngestRunId) context.inngestRunId = row.inngestRunId;
  if (row.attemptNumber !== null) context.attemptNumber = row.attemptNumber;

  const envelope: DiagnosticEventEnvelope = {
    eventId: row.id,
    event: isDiagnosticEventName(row.event) ? row.event : "telemetry.degraded",
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    correlation: row.correlation === "partial" ? "partial" : "full",
    context,
  };
  if (row.durationMs !== null) envelope.durationMs = row.durationMs;
  if (row.stage && isDiagnosticStage(row.stage)) envelope.stage = row.stage;
  if (row.status && isDiagnosticEventStatus(row.status)) envelope.status = row.status;
  if (row.callId && row.provider && row.requestedModel) {
    envelope.call = {
      callId: row.callId,
      provider: row.provider,
      requestedModel: row.requestedModel,
      returnedModel: row.returnedModel,
      providerRequestId: row.providerRequestId,
    };
    if (row.latencyMs !== null) envelope.call.latencyMs = row.latencyMs;
    if (row.inputTokens !== null) envelope.call.inputTokens = row.inputTokens;
    if (row.outputTokens !== null) envelope.call.outputTokens = row.outputTokens;
  }
  if (row.errorClass !== null || row.errorStatus !== null || row.errorReason !== null) {
    envelope.error = {
      errorClass: row.errorClass,
      status: row.errorStatus,
      reason: row.errorReason,
    };
  }
  if (row.sentryEventId || row.inngestRunId || row.langfuseTraceId || row.langfuseObservationId) {
    envelope.externalRefs = {};
    if (row.sentryEventId) envelope.externalRefs.sentryEventId = row.sentryEventId;
    if (row.inngestRunId) envelope.externalRefs.inngestRunId = row.inngestRunId;
    if (row.langfuseTraceId) envelope.externalRefs.langfuseTraceId = row.langfuseTraceId;
    if (row.langfuseObservationId) {
      envelope.externalRefs.langfuseObservationId = row.langfuseObservationId;
    }
  }
  if (
    row.contentAvailability &&
    row.contentPolicyVersion &&
    (CONTENT_AVAILABILITY_STATES as readonly string[]).includes(row.contentAvailability)
  ) {
    envelope.content = {
      availability: row.contentAvailability as ContentAvailabilityState,
      policyVersion: row.contentPolicyVersion,
    };
  }
  if (isPlainRecord(row.attributes)) {
    envelope.attributes = row.attributes as Record<
      string,
      string | number | boolean | null
    >;
  }
  return envelope;
}

// ---------------------------------------------------------------------------
// Default process-wide instance (frozen contract surface).
// ---------------------------------------------------------------------------

const defaultJournal = createDiagnosticJournal();

export const enqueueDiagnosticEvent: EnqueueDiagnosticEvent = (event) => {
  defaultJournal.enqueue(event);
};

export const emitDiagnosticEvent: EmitDiagnosticEvent = async (event) => {
  await defaultJournal.emit(event);
};

export const flushDiagnosticEvents: FlushDiagnosticEvents = () =>
  defaultJournal.flush();

export const listDiagnosticEvents: ListDiagnosticEvents = async (input) => {
  const workspaceId = input?.workspaceId;
  const workItemId = input?.workItemId;
  if (!isNonEmptyString(workspaceId) || !isNonEmptyString(workItemId)) {
    throw new DiagnosticJournalError(
      "INVALID_SCOPE",
      "listDiagnosticEvents: workspaceId and workItemId are required",
    );
  }
  const take = normalizeLimit(input?.limit);
  const position = input?.cursor === undefined ? null : decodeCursor(input.cursor);
  const rows = await db
    .select()
    .from(diagnosticEvents)
    .where(
      and(
        eq(diagnosticEvents.workspaceId, workspaceId),
        eq(diagnosticEvents.workItemId, workItemId),
        // The cursor instant travels as UTC ISO text — the same value
        // drizzle's timestamp mapping writes on insert. Passing a raw Date
        // would let the driver reformat it in local time and skew the page.
        position
          ? sql`("occurred_at", "id") > (${position.occurredAt.toISOString()}, ${position.id})`
          : undefined,
      ),
    )
    .orderBy(asc(diagnosticEvents.occurredAt), asc(diagnosticEvents.id))
    .limit(take + 1);
  const page = rows.slice(0, take);
  return {
    events: page.map(toEnvelope),
    nextCursor:
      rows.length > take && page.length > 0
        ? encodeCursor(page[page.length - 1])
        : null,
  };
};

export function getDiagnosticJournalStats(): DiagnosticJournalStats {
  return defaultJournal.stats();
}

export function startDiagnosticJournal(): void {
  defaultJournal.start();
}

export function stopDiagnosticJournal(): void {
  defaultJournal.stop();
}

export function shutdownDiagnosticJournal(timeoutMs: number): Promise<void> {
  return defaultJournal.shutdown(timeoutMs);
}
