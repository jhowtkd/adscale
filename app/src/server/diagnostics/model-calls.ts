import "server-only";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { SpanStatusCode, type Attributes, type Span } from "@opentelemetry/api";

import { redactTelemetry } from "../../lib/redact-telemetry";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  isDiagnosticStage,
  type DiagnosticContext,
  type DiagnosticEventEnvelope,
  type DiagnosticEventName,
  type DiagnosticEventStatus,
  type DiagnosticModelCall,
  type DiagnosticProcess,
  type ModelCallSpec,
  type ModelResponseMetadata,
  type ObserveModelCall,
} from "./contract";
import { getDiagnosticContext } from "./context";
import { enqueueDiagnosticEvent } from "./journal";
import { normalizeModelCallError } from "./model-call-metadata";
import { initializeObservability, startAiSpan } from "./observability";
import { installObservabilityShutdownHooks } from "./shutdown";

/**
 * Observed model calls on the Peça única flow (jhowtkd/adscale#389).
 *
 * `observeModelCall` is the single choke point for the frozen inventory
 * (CP-01..CP-11): requested vs returned provider/model, measured latency,
 * provider-returned usage only, and an honest split between transport
 * failure, content-validation failure and quality verdicts — written
 * through the journal (#387) with isolated AI spans (#388).
 *
 * The wrapper observes only: it returns the same value / rethrows the same
 * error, never re-invokes `call`, never adds retries, and never lets a
 * summarize / redact / export / logger fault change generation, billing,
 * approval or retry decisions. Without an ambient single-work context it
 * is a pure pass-through, so shared functions and unused-by-scope paths
 * gain no capture.
 */

export {
  MODEL_CALL_MAX_CLASS_LENGTH,
  MODEL_CALL_MAX_REASON_LENGTH,
  newModelCallId,
  normalizeModelCallError,
  summarizeChatCompletion,
  summarizeImageResult,
  summarizeResponsesApi,
} from "./model-call-metadata";

/** Error class recorded on `model.validation.failed` events. */
export const MODEL_VALIDATION_ERROR_CLASS = "ContentValidationError";

/** Maximum stored length for a validation-failure reason. */
export const MODEL_VALIDATION_MAX_REASON_LENGTH = 64;

/** Maximum length of a string span attribute set by this module. */
export const MODEL_CALL_MAX_SPAN_TEXT_LENGTH = 512;

type ModelCallEventSink = (event: DiagnosticEventEnvelope) => void;
type ModelCallSpanStarter = (
  name: string,
  attributes?: Attributes,
) => Span | undefined;

let eventSink: ModelCallEventSink = enqueueDiagnosticEvent;
let spanStarter: ModelCallSpanStarter = startAiSpan;
let tracingEnsured = false;

/** Test-only sink override (unit tests capture events without a database). */
export function __setModelCallEventSinkForTests(
  sink: ModelCallEventSink | null,
): void {
  eventSink = sink ?? enqueueDiagnosticEvent;
}

/** Test-only span-starter override (unit tests capture spans without init). */
export function __setModelCallSpanStarterForTests(
  starter: ModelCallSpanStarter | null,
): void {
  spanStarter = starter ?? startAiSpan;
}

function safeAmbientSingleContext(): DiagnosticContext | null {
  try {
    const context = getDiagnosticContext();
    if (!context || context.protocol !== "single") return null;
    return context;
  } catch {
    return null;
  }
}

function isObservableSpec(spec: ModelCallSpec): boolean {
  try {
    return (
      typeof spec?.callId === "string" &&
      spec.callId.length > 0 &&
      typeof spec?.provider === "string" &&
      spec.provider.length > 0 &&
      typeof spec?.requestedModel === "string" &&
      spec.requestedModel.length > 0 &&
      isDiagnosticStage(spec?.stage)
    );
  } catch {
    return false;
  }
}

/**
 * First runtime consumer of the isolated tracer (#388): one lazy,
 * fire-and-forget init per process plus the shutdown hooks, so init always
 * precedes any timed shutdown. Never throws, never blocks generation.
 */
export function ensureModelCallTracing(processName: DiagnosticProcess): void {
  if (tracingEnsured) return;
  tracingEnsured = true;
  try {
    installObservabilityShutdownHooks();
  } catch {
    // Hooks are best-effort; generation never depends on them.
  }
  try {
    void initializeObservability(processName);
  } catch {
    // initializeObservability never rejects; belt-and-braces.
  }
}

/** Test-only reset for the lazy-init guard. Never use in production code. */
export function __resetModelCallTracingForTests(): void {
  tracingEnsured = false;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emitSafely(event: DiagnosticEventEnvelope): void {
  try {
    eventSink(event);
  } catch {
    // Telemetry faults never disturb generation.
  }
}

function buildEnvelope(input: {
  event: DiagnosticEventName;
  status: DiagnosticEventStatus;
  context: DiagnosticContext;
  spec: ModelCallSpec;
  occurredAt: string;
  durationMs?: number;
  call: DiagnosticModelCall;
  error?: DiagnosticEventEnvelope["error"];
  attributes?: Record<string, string | number | boolean | null>;
}): DiagnosticEventEnvelope {
  return {
    eventId: randomUUID(),
    event: input.event,
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    occurredAt: input.occurredAt,
    recordedAt: nowIso(),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    stage: input.spec.stage,
    status: input.status,
    correlation: "full",
    context: input.context,
    call: input.call,
    ...(input.error === undefined ? {} : { error: input.error }),
    ...(input.attributes === undefined ? {} : { attributes: input.attributes }),
  };
}

function buildCallBase(spec: ModelCallSpec): {
  callId: string;
  provider: string;
  requestedModel: string;
} {
  return {
    callId: spec.callId,
    provider: spec.provider,
    requestedModel: spec.requestedModel,
  };
}

function withMetadata(
  base: ReturnType<typeof buildCallBase>,
  meta: ModelResponseMetadata,
  latencyMs: number,
): DiagnosticModelCall {
  return {
    ...base,
    returnedModel: meta.returnedModel,
    providerRequestId: meta.providerRequestId,
    latencyMs,
    ...(meta.inputTokens === undefined ? {} : { inputTokens: meta.inputTokens }),
    ...(meta.outputTokens === undefined ? {} : { outputTokens: meta.outputTokens }),
  };
}

function boundSpanText(value: string): string {
  return value.length > MODEL_CALL_MAX_SPAN_TEXT_LENGTH
    ? value.slice(0, MODEL_CALL_MAX_SPAN_TEXT_LENGTH)
    : value;
}

function startSpanSafely(
  name: string,
  attributes: Attributes,
): Span | undefined {
  try {
    return spanStarter(name, attributes) ?? undefined;
  } catch {
    return undefined;
  }
}

function setSpanAttributesSafely(
  span: Span | undefined,
  attributes: Attributes,
): void {
  if (!span) return;
  try {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, typeof value === "string" ? boundSpanText(value) : value);
    }
  } catch {
    // Span faults never disturb generation.
  }
}

function endSpanSafely(span: Span | undefined): void {
  if (!span) return;
  try {
    span.end();
  } catch {
    // Span faults never disturb generation.
  }
}

function failSpanSafely(
  span: Span | undefined,
  attributes: Attributes,
  message: string,
): void {
  if (!span) return;
  setSpanAttributesSafely(span, attributes);
  try {
    span.setStatus({ code: SpanStatusCode.ERROR, message: boundSpanText(message) });
  } catch {
    // Span faults never disturb generation.
  }
  endSpanSafely(span);
}

function validationReasonFrom(error: unknown): string {
  try {
    if (error instanceof Error && error.name.trim().length > 0) {
      return boundValidationReason(error.name);
    }
  } catch {
    // Fall through to the default below.
  }
  return "unknown";
}

function boundValidationReason(reason: string): string {
  const redacted = redactTelemetry(reason);
  const text = typeof redacted === "string" ? redacted : "unknown";
  const trimmed = text.trim();
  const base = trimmed.length > 0 ? trimmed : "unknown";
  return base.length > MODEL_VALIDATION_MAX_REASON_LENGTH
    ? base.slice(0, MODEL_VALIDATION_MAX_REASON_LENGTH)
    : base;
}

export const observeModelCall: ObserveModelCall = async (
  spec,
  call,
  summarize,
) => {
  const context = safeAmbientSingleContext();
  if (!context || !isObservableSpec(spec)) {
    return call();
  }
  ensureModelCallTracing(context.process);
  const base = buildCallBase(spec);
  const startMark = performance.now();
  const startedAt = nowIso();
  emitSafely(
    buildEnvelope({
      event: "model.call.started",
      status: "started",
      context,
      spec,
      occurredAt: startedAt,
      call: { ...base, returnedModel: null, providerRequestId: null },
    }),
  );
  const span = startSpanSafely("model.call", {
    "adscale.workspace_id": context.workspaceId,
    "adscale.work_item_id": context.workItemId,
    "adscale.operation_id": context.operationId,
    "adscale.call_id": spec.callId,
    "adscale.stage": spec.stage,
    "adscale.provider": spec.provider,
    "adscale.requested_model": spec.requestedModel,
  });
  let value: Awaited<ReturnType<typeof call>>;
  try {
    value = await call();
  } catch (error) {
    const elapsedMs = Math.max(0, Math.round(performance.now() - startMark));
    let normalized = {
      error: { errorClass: null as string | null, status: null as number | null, reason: null as string | null },
      timeout: false,
    };
    try {
      normalized = normalizeModelCallError(error);
    } catch {
      // Normalization faults keep the failure honest-but-minimal.
    }
    emitSafely(
      buildEnvelope({
        event: "model.call.failed",
        status: "failed",
        context,
        spec,
        occurredAt: nowIso(),
        durationMs: elapsedMs,
        call: {
          ...base,
          returnedModel: null,
          providerRequestId: null,
          latencyMs: elapsedMs,
        },
        error: normalized.error,
        ...(normalized.timeout
          ? { attributes: { timeout: true, remoteOutcome: "unknown" } }
          : {}),
      }),
    );
    failSpanSafely(
      span,
      {
        "adscale.latency_ms": elapsedMs,
        ...(normalized.error.errorClass === null
          ? {}
          : { "adscale.error_class": normalized.error.errorClass }),
        ...(normalized.error.status === null
          ? {}
          : { "adscale.error_status": normalized.error.status }),
        ...(normalized.error.reason === null
          ? {}
          : { "adscale.error_reason": normalized.error.reason }),
        ...(normalized.timeout
          ? { "adscale.timeout": true, "adscale.remote_outcome": "unknown" }
          : {}),
      },
      normalized.error.errorClass ?? "UnknownError",
    );
    throw error;
  }
  let meta: ModelResponseMetadata;
  try {
    meta = summarize(value);
  } catch (error) {
    // The transport answered but the payload cannot be summarized: record
    // the answered transport plus a validation failure, then rethrow the
    // identical error. `call` is never invoked again.
    const elapsedMs = Math.max(0, Math.round(performance.now() - startMark));
    const endedAt = nowIso();
    emitSafely(
      buildEnvelope({
        event: "model.call.completed",
        status: "completed",
        context,
        spec,
        occurredAt: endedAt,
        durationMs: elapsedMs,
        call: { ...base, returnedModel: null, providerRequestId: null, latencyMs: elapsedMs },
      }),
    );
    emitSafely(
      buildEnvelope({
        event: "model.validation.failed",
        status: "failed",
        context,
        spec,
        occurredAt: endedAt,
        durationMs: elapsedMs,
        call: { ...base, returnedModel: null, providerRequestId: null, latencyMs: elapsedMs },
        error: {
          errorClass: MODEL_VALIDATION_ERROR_CLASS,
          status: null,
          reason: validationReasonFrom(error),
        },
      }),
    );
    failSpanSafely(
      span,
      {
        "adscale.latency_ms": elapsedMs,
        "adscale.validation_failed": true,
      },
      MODEL_VALIDATION_ERROR_CLASS,
    );
    throw error;
  }
  const elapsedMs = Math.max(0, Math.round(performance.now() - startMark));
  emitSafely(
    buildEnvelope({
      event: "model.call.completed",
      status: "completed",
      context,
      spec,
      occurredAt: nowIso(),
      durationMs: elapsedMs,
      call: withMetadata(base, meta, elapsedMs),
    }),
  );
  setSpanAttributesSafely(span, {
    "adscale.latency_ms": elapsedMs,
    ...(meta.returnedModel === null ? {} : { "adscale.returned_model": meta.returnedModel }),
    ...(meta.providerRequestId === null
      ? {}
      : { "adscale.provider_request_id": meta.providerRequestId }),
    ...(meta.inputTokens === undefined ? {} : { "adscale.input_tokens": meta.inputTokens }),
    ...(meta.outputTokens === undefined ? {} : { "adscale.output_tokens": meta.outputTokens }),
  });
  endSpanSafely(span);
  return value;
};

export interface ReportModelValidationFailedInput {
  callId: string;
  provider: string;
  requestedModel: string;
  stage: ModelCallSpec["stage"];
  /** Short cause code (e.g. "empty-content", "invalid-json", "schema-mismatch"). */
  reason: string;
  /** Measured transport latency when the caller still has it. */
  latencyMs?: number;
}

/**
 * Record a content-validation failure for an answered transport: HTTP 200
 * with empty / unparsable / schema-rejecting JSON. The transport outcome
 * stays `model.call.completed` (emitted by `observeModelCall`); this event
 * carries the `callId` link. Silent without an ambient single-work
 * context; never throws.
 */
export function reportModelValidationFailed(
  input: ReportModelValidationFailedInput,
): void {
  try {
    const context = safeAmbientSingleContext();
    if (!context) return;
    if (
      typeof input?.callId !== "string" ||
      input.callId.length === 0 ||
      typeof input?.provider !== "string" ||
      input.provider.length === 0 ||
      typeof input?.requestedModel !== "string" ||
      input.requestedModel.length === 0 ||
      !isDiagnosticStage(input?.stage) ||
      typeof input?.reason !== "string" ||
      input.reason.length === 0
    ) {
      return;
    }
    const latencyMs =
      typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs) && input.latencyMs >= 0
        ? Math.round(input.latencyMs)
        : undefined;
    emitSafely(
      buildEnvelope({
        event: "model.validation.failed",
        status: "failed",
        context,
        spec: {
          callId: input.callId,
          provider: input.provider,
          requestedModel: input.requestedModel,
          stage: input.stage,
        },
        occurredAt: nowIso(),
        ...(latencyMs === undefined ? {} : { durationMs: latencyMs }),
        call: {
          callId: input.callId,
          provider: input.provider,
          requestedModel: input.requestedModel,
          returnedModel: null,
          providerRequestId: null,
          ...(latencyMs === undefined ? {} : { latencyMs }),
        },
        error: {
          errorClass: MODEL_VALIDATION_ERROR_CLASS,
          status: null,
          reason: boundValidationReason(input.reason),
        },
      }),
    );
  } catch {
    // Telemetry faults never disturb generation.
  }
}
