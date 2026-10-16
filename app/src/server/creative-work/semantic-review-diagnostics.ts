import { randomUUID } from "node:crypto";
import { DIAGNOSTIC_SCHEMA_VERSION, type DiagnosticContext, type DiagnosticEventEnvelope, type DiagnosticEventName } from "../diagnostics/contract";
import type { JevResult } from "./semantic-review-http";
import { SEMANTIC_MODEL } from "./semantic-review-offline";

export type SemanticReviewDiagnosticSink = (event: DiagnosticEventEnvelope) => void;
function record(sink: SemanticReviewDiagnosticSink, context: DiagnosticContext, event: DiagnosticEventName,
  details: Partial<Pick<DiagnosticEventEnvelope, "call" | "durationMs" | "error">> = {}) {
  try {
    const at = new Date().toISOString();
    sink({ eventId: randomUUID(), event, schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      occurredAt: at, recordedAt: at, status: event.endsWith("started") ? "started" : event.endsWith("completed") ? "completed" : "failed",
      correlation: "full", context, attributes: { operationKind: "semantic_review" }, ...details });
  } catch { /* Journal loss cannot affect processing or cause a second send. */ }
}

/** The #467 sequence, shared with persisted processing. No stage or content. */
export async function runSemanticReviewCall(options: {
  context: DiagnosticContext;
  sink: SemanticReviewDiagnosticSink;
  call: () => Promise<JevResult>;
}) {
  const { context, sink } = options;
  const call = { callId: randomUUID(), provider: "typesafe", requestedModel: SEMANTIC_MODEL, returnedModel: null, providerRequestId: null };
  record(sink, context, "operation.started");
  record(sink, context, "model.call.started", { call });
  const started = performance.now();
  let result: JevResult;
  try { result = await options.call(); }
  catch { result = { ok: false, reason: "network_error" }; }
  const durationMs = Math.max(0, Math.round(performance.now() - started));
  if (result.ok) {
    record(sink, context, "model.call.completed", { durationMs, call: { ...call, returnedModel: SEMANTIC_MODEL, latencyMs: durationMs,
      ...(result.usage ? { inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens } : {}) } });
    record(sink, context, "operation.completed");
  } else {
    const error = { errorClass: null, status: result.status ?? null, reason: result.reason };
    record(sink, context, "model.call.failed", { durationMs, call: { ...call, latencyMs: durationMs }, error });
    record(sink, context, "operation.failed", { error });
  }
  return result;
}

export function semanticReviewFailureState(result: Extract<JevResult, { ok: false }>) {
  return result.reason === "timeout" || result.reason === "network_error" || (result.reason === "http_status" && (result.status ?? 0) >= 500)
    ? "outcome_unknown" as const : "failed" as const;
}
