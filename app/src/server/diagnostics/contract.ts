/**
 * Frozen traceability contract — Peça única diagnostics (jhowtkd/adscale#384).
 *
 * This module freezes the vocabulary that later tickets build against:
 * diagnostic stages, DiagnosticContext, the journal event envelope and event
 * names. It carries NO runtime behavior beyond frozen constants and pure
 * predicates — context propagation, the journal, redaction and capture land
 * in later tickets (#385 owns logger/redaction/capture).
 *
 * Values mirror the approved spec (jhowtkd/adscale#382) verbatim. Any change
 * here is a contract break: it requires a new ADR and a schemaVersion bump.
 */

/** Journal event / context schema version. Never reinterpret v1 payloads. */
export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

/**
 * Pipeline stages of the single-piece flow, in journey order.
 * `queue` is waiting time; `selection`/`export` continue past "image ready".
 */
export const DIAGNOSTIC_STAGES = [
  "source_analysis",
  "prepare",
  "briefing",
  "copy",
  "copy_rewrite",
  "art_direction",
  "queue",
  "image",
  "composition",
  "quality",
  "revision",
  "selection",
  "export",
] as const;

export type DiagnosticStage = (typeof DIAGNOSTIC_STAGES)[number];

export function isDiagnosticStage(value: unknown): value is DiagnosticStage {
  return (
    typeof value === "string" &&
    (DIAGNOSTIC_STAGES as readonly string[]).includes(value)
  );
}

/** Where the observed data came from. `test`/`synthetic` never mix with prod cohorts. */
export const DIAGNOSTIC_DATA_ORIGINS = [
  "production",
  "staging",
  "synthetic",
  "test",
] as const;

export type DiagnosticDataOrigin = (typeof DIAGNOSTIC_DATA_ORIGINS)[number];

export function isDiagnosticDataOrigin(
  value: unknown,
): value is DiagnosticDataOrigin {
  return (
    typeof value === "string" &&
    (DIAGNOSTIC_DATA_ORIGINS as readonly string[]).includes(value)
  );
}

export type DiagnosticProcess = "web" | "worker";

/**
 * Correlation identity for one operation. Carried in an OPTIONAL metadata
 * envelope on async events: old events without it keep running, and events
 * observed without prior context are marked partial — never rejected.
 */
export interface DiagnosticContext {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  workspaceId: string;
  clientProfileId: string | null;
  workItemId: string;
  protocol: "single";
  operationId: string;
  parentOperationId?: string;
  generationCorrelationId?: string;
  outputId?: string;
  inngestRunId?: string;
  attemptNumber?: number;
  releaseSha: string;
  environment: string;
  process: DiagnosticProcess;
  dataOrigin: DiagnosticDataOrigin;
}

/** Minimum event vocabulary. Current telemetry is mapped, never double-emitted. */
export const DIAGNOSTIC_EVENT_NAMES = [
  "operation.started",
  "stage.started",
  "stage.completed",
  "stage.failed",
  "model.call.started",
  "model.call.completed",
  "model.call.failed",
  "model.validation.failed",
  "operation.replayed",
  "operation.completed",
  "operation.failed",
  "selection.confirmed",
  "selection.effect.failed",
  "export.prepared",
  "export.served",
  "telemetry.degraded",
] as const;

export type DiagnosticEventName = (typeof DIAGNOSTIC_EVENT_NAMES)[number];

export function isDiagnosticEventName(
  value: unknown,
): value is DiagnosticEventName {
  return (
    typeof value === "string" &&
    (DIAGNOSTIC_EVENT_NAMES as readonly string[]).includes(value)
  );
}

/** Coarse lifecycle status for the journal index. Nuance lives in the payload. */
export const DIAGNOSTIC_EVENT_STATUSES = [
  "started",
  "completed",
  "failed",
] as const;

export type DiagnosticEventStatus = (typeof DIAGNOSTIC_EVENT_STATUSES)[number];

export function isDiagnosticEventStatus(
  value: unknown,
): value is DiagnosticEventStatus {
  return (
    typeof value === "string" &&
    (DIAGNOSTIC_EVENT_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * What the console may say about content attached to a call.
 * `redacted` content is NEVER a verbatim reproduction.
 */
export const CONTENT_AVAILABILITY_STATES = [
  "not_collected",
  "redacted",
  "truncated",
  "expired",
  "unavailable",
] as const;

export type ContentAvailabilityState =
  (typeof CONTENT_AVAILABILITY_STATES)[number];

/** Content modes for the pilot. There is no `raw` mode in v1. */
export const DIAGNOSTIC_CONTENT_MODES = ["metadata_only", "redacted"] as const;

export type DiagnosticContentMode = (typeof DIAGNOSTIC_CONTENT_MODES)[number];

/** Model-call facts. Usage/request IDs appear ONLY when actually returned. */
export interface DiagnosticModelCall {
  callId: string;
  provider: string;
  requestedModel: string;
  returnedModel: string | null;
  providerRequestId: string | null;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** Normalized provider failure. Never invent class/status/reason. */
export interface DiagnosticEventError {
  errorClass: string | null;
  status: number | null;
  reason: string | null;
}

/** Independent per-destination IDs, stitched in the console. No shared traceId required. */
export interface DiagnosticExternalRefs {
  sentryEventId?: string;
  inngestRunId?: string;
  langfuseTraceId?: string;
  langfuseObservationId?: string;
}

export interface DiagnosticContentRef {
  availability: ContentAvailabilityState;
  policyVersion: string;
}

/**
 * Journal event envelope. The index deduplicates on `eventId`.
 * Visual order follows causality; clocks across processes are NOT comparable.
 */
export interface DiagnosticEventEnvelope {
  eventId: string;
  event: DiagnosticEventName;
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  occurredAt: string;
  recordedAt: string;
  /** Monotonic duration, present only when actually measured. */
  durationMs?: number;
  stage?: DiagnosticStage;
  status?: DiagnosticEventStatus;
  /** `partial` when observed without prior context. Never rejects the event. */
  correlation: "full" | "partial";
  context: DiagnosticContext | null;
  call?: DiagnosticModelCall;
  error?: DiagnosticEventError;
  externalRefs?: DiagnosticExternalRefs;
  content?: DiagnosticContentRef;
  /** Sanitized, bounded extra attributes. No prompts, payloads or secrets. */
  attributes?: Record<string, string | number | boolean | null>;
}

/** Inngest metadata envelope key. Business metadata never enters prompts, step returns or dedupe keys. */
export const DIAGNOSTIC_ENVELOPE_KEY = "diagnosticContext" as const;

/** Proposed observability flags and their frozen defaults (off until rollout). */
export const DIAGNOSTIC_FLAG_DEFAULTS = {
  OBSERVABILITY_ENABLED: false,
  OBSERVABILITY_LANGFUSE_ENABLED: false,
  OBSERVABILITY_WORKSPACE_ALLOWLIST: "",
  OBSERVABILITY_CONTENT_MODE: "metadata_only",
} as const;

/** Local index export budget (initial design values from the spec). */
export const DIAGNOSTIC_EXPORT_BUDGET = {
  maxBufferedEvents: 128,
  maxBufferedBytes: 512 * 1024,
  maxBatchEvents: 25,
  maxConcurrentFlushes: 1,
  flushIntervalMs: 1000,
  maxEventBytes: 16 * 1024,
} as const;

// ---------------------------------------------------------------------------
// Frozen function signatures (names + shapes only — implemented later).
// `redactTelemetry` is owned by #385; referenced here as contract, not behavior.
// ---------------------------------------------------------------------------

/** Async context boundary. Implemented by the context-propagation ticket. */
export type WithDiagnosticContext = <T>(
  context: DiagnosticContext,
  run: () => Promise<T>,
) => Promise<T>;

export type GetDiagnosticContext = () => DiagnosticContext | undefined;

export interface ModelCallSpec {
  callId: string;
  provider: string;
  requestedModel: string;
  stage: DiagnosticStage;
}

export interface ModelResponseMetadata {
  returnedModel: string | null;
  providerRequestId: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Single choke point for every inventoried model call. Returns the same value
 * / rethrows the same error; never re-invokes `call`; adds no retries.
 */
export type ObserveModelCall = <T>(
  spec: ModelCallSpec,
  call: () => Promise<T>,
  summarize: (value: T) => ModelResponseMetadata,
) => Promise<T>;

/** Contract name/signature only — behavior lands in #385. Never mutates input. */
export type RedactTelemetry = (value: unknown) => unknown;

/** Returns a Sentry ID only when actually obtained; never a fabricated one. */
export type CaptureDiagnosticFailure = (
  error: unknown,
  context: DiagnosticContext | null,
) => Promise<string | null>;

export type EmitDiagnosticEvent = (
  event: DiagnosticEventEnvelope,
) => Promise<void>;

export type EnqueueDiagnosticEvent = (event: DiagnosticEventEnvelope) => void;

export type FlushDiagnosticEvents = () => Promise<void>;

export interface ListDiagnosticEventsInput {
  workspaceId: string;
  workItemId: string;
  cursor?: string;
  limit?: number;
}

export type ListDiagnosticEvents = (
  input: ListDiagnosticEventsInput,
) => Promise<{ events: DiagnosticEventEnvelope[]; nextCursor: string | null }>;

export type InitializeObservability = (process: DiagnosticProcess) => Promise<void>;

export type ShutdownObservability = (timeoutMs: number) => Promise<void>;

/** Isolated AI tracer provider. Never registered globally (see ADR-0017). */
export type GetAiTracerProvider = () => unknown;

export interface GetWorkDiagnosticsInput {
  workspaceId: string;
  workItemId: string;
  cursor?: string;
  limit?: number;
}

export type GetWorkDiagnostics = (
  input: GetWorkDiagnosticsInput,
) => Promise<unknown>;

export interface GetDiagnosticCallInput {
  workspaceId: string;
  workItemId: string;
  callId: string;
  actorId: string;
  reason: string;
}

export type GetDiagnosticCall = (
  input: GetDiagnosticCallInput,
) => Promise<unknown>;

export type ResolveContentPolicy = (
  workspaceId: string,
) => Promise<DiagnosticContentMode>;

export type CleanupDiagnosticData = (now: Date) => Promise<unknown>;
