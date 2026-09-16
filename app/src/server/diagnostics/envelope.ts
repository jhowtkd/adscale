import "server-only";
import {
  DIAGNOSTIC_ENVELOPE_KEY,
  DIAGNOSTIC_SCHEMA_VERSION,
  isDiagnosticDataOrigin,
  type DiagnosticContext,
} from "./contract";
import {
  createDiagnosticContext,
  getDiagnosticContext,
  withDiagnosticContext,
} from "./context";

/**
 * Optional metadata envelope for the async boundary (trace-386).
 *
 * The envelope carries the frozen DiagnosticContext inside Inngest event
 * data under DIAGNOSTIC_ENVELOPE_KEY. It is client-agnostic: both Inngest
 * clients propagate it without unification because it travels as data.
 *
 * Rules (spec #382 identification contract):
 * - Old events without the envelope keep running; reads degrade to partial
 *   correlation and never reject valid work.
 * - Only known DiagnosticContext fields are ever adopted. Externally
 *   supplied authorization or unknown fields are ignored; server-validated
 *   identity is the only identity.
 * - Envelope metadata never enters prompts, step returns, fingerprints,
 *   snapshots or dedupe keys: attach/reentry only read and forward it.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Absent is fine; present must be a non-empty string. `false` = malformed. */
function optionalNonEmptyString(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  return nonEmptyString(value) ? value : false;
}

function validAttemptNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

/**
 * Attach a context to event data. No context (or an envelope already
 * present) returns the data untouched, so legacy payloads stay
 * byte-identical. Business fields are never modified.
 */
export function attachDiagnosticEnvelope(
  data: Record<string, unknown>,
  context: DiagnosticContext | undefined = getDiagnosticContext(),
): Record<string, unknown> {
  if (!context || data[DIAGNOSTIC_ENVELOPE_KEY] !== undefined) return data;
  return { ...data, [DIAGNOSTIC_ENVELOPE_KEY]: { ...context } };
}

/**
 * Strict allowlist parse of the envelope. Returns the adopted context, or
 * null when the envelope is missing or malformed. Unknown fields — including
 * any externally supplied authorization material — are dropped.
 */
export function extractDiagnosticEnvelope(
  data: unknown,
): DiagnosticContext | null {
  if (!isRecord(data)) return null;
  const envelope = data[DIAGNOSTIC_ENVELOPE_KEY];
  if (!isRecord(envelope)) return null;

  const {
    schemaVersion,
    workspaceId,
    clientProfileId,
    workItemId,
    protocol,
    operationId,
    parentOperationId,
    generationCorrelationId,
    outputId,
    inngestRunId,
    attemptNumber,
    releaseSha,
    environment,
    process,
    dataOrigin,
  } = envelope;

  if (schemaVersion !== DIAGNOSTIC_SCHEMA_VERSION) return null;
  if (protocol !== "single") return null;
  if (
    !nonEmptyString(workspaceId) ||
    !nonEmptyString(workItemId) ||
    !nonEmptyString(operationId) ||
    !nonEmptyString(releaseSha) ||
    !nonEmptyString(environment)
  ) {
    return null;
  }
  if (clientProfileId !== null && !nonEmptyString(clientProfileId)) return null;
  if (process !== "web" && process !== "worker") return null;
  if (!isDiagnosticDataOrigin(dataOrigin)) return null;

  const parent = optionalNonEmptyString(parentOperationId);
  const correlation = optionalNonEmptyString(generationCorrelationId);
  const output = optionalNonEmptyString(outputId);
  const run = optionalNonEmptyString(inngestRunId);
  if (
    parent === false ||
    correlation === false ||
    output === false ||
    run === false
  ) {
    return null;
  }
  if (attemptNumber !== undefined && !validAttemptNumber(attemptNumber)) {
    return null;
  }

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    workspaceId,
    clientProfileId,
    workItemId,
    protocol: "single",
    operationId,
    ...(parent !== undefined ? { parentOperationId: parent } : {}),
    ...(correlation !== undefined
      ? { generationCorrelationId: correlation }
      : {}),
    ...(output !== undefined ? { outputId: output } : {}),
    ...(run !== undefined ? { inngestRunId: run } : {}),
    ...(attemptNumber !== undefined ? { attemptNumber } : {}),
    releaseSha,
    environment,
    process,
    dataOrigin,
  };
}

export interface DiagnosticReentryOptions {
  runId?: unknown;
  attempt?: unknown;
  expected?: {
    workspaceId?: unknown;
    workItemId?: unknown;
    outputId?: unknown;
  };
}

export interface DiagnosticReentry {
  context: DiagnosticContext | null;
  correlation: "full" | "partial";
}

/**
 * Worker reentry: adopt the envelope context for execution.
 *
 * - Missing/malformed envelope, or an envelope whose identity disagrees
 *   with the event, yields no context with partial correlation. The worker
 *   must proceed regardless — telemetry gaps never reject valid work.
 * - Live run/attempt ids bind only absent fields. Existing ids are
 *   preserved, never overwritten; a repeated run under a new run id (or a
 *   repeated attempt) keeps the original ids with partial correlation.
 * - Run/attempt ids are never invented: absent live values stay absent.
 */
export function reenterDiagnosticContext(
  data: unknown,
  options: DiagnosticReentryOptions = {},
): DiagnosticReentry {
  const extracted = extractDiagnosticEnvelope(data);
  if (!extracted) return { context: null, correlation: "partial" };

  const expected = options.expected;
  if (expected) {
    if (
      expected.workspaceId !== undefined &&
      expected.workspaceId !== extracted.workspaceId
    ) {
      return { context: null, correlation: "partial" };
    }
    if (
      expected.workItemId !== undefined &&
      expected.workItemId !== extracted.workItemId
    ) {
      return { context: null, correlation: "partial" };
    }
    if (
      expected.outputId !== undefined &&
      extracted.outputId !== undefined &&
      expected.outputId !== extracted.outputId
    ) {
      return { context: null, correlation: "partial" };
    }
  }

  const liveRunId = nonEmptyString(options.runId) ? options.runId : undefined;
  const liveAttempt = validAttemptNumber(options.attempt)
    ? options.attempt
    : undefined;

  let correlation: "full" | "partial" = "full";
  let inngestRunId = extracted.inngestRunId;
  let attemptNumber = extracted.attemptNumber;
  if (liveRunId !== undefined) {
    if (inngestRunId === undefined) inngestRunId = liveRunId;
    else if (inngestRunId !== liveRunId) correlation = "partial";
  }
  if (liveAttempt !== undefined) {
    if (attemptNumber === undefined) attemptNumber = liveAttempt;
    else if (attemptNumber !== liveAttempt) correlation = "partial";
  }

  return {
    context: {
      ...extracted,
      process: "worker",
      ...(inngestRunId !== undefined ? { inngestRunId } : {}),
      ...(attemptNumber !== undefined ? { attemptNumber } : {}),
    },
    correlation,
  };
}

export interface DispatchWorkIdentity {
  toolKind: string;
  clientProfileId: string | null;
}

export interface DiagnosticDispatchInput {
  workspaceId: string;
  workItemId: string;
  outputId?: string;
  generationCorrelationId?: string;
  work?: DispatchWorkIdentity | null;
  /**
   * True at operation origins (web dispatch): synthesize a fresh single
   * operation when no ambient context applies. False at continuations
   * (worker re-dispatch): propagate ambient context only, never invent one,
   * so old envelopeless flows keep their legacy shape.
   */
  synthesize: boolean;
}

/**
 * Resolve the context to attach at a send point. Ambient context is reused
 * only when it matches the dispatched work; a foreign ambient context is
 * never attached. Synthesis is gated on single-protocol work with
 * server-validated identity, so tracking metadata is added only at
 * in-scope send points.
 */
export function diagnosticContextForDispatch(
  input: DiagnosticDispatchInput,
): DiagnosticContext | undefined {
  const ambient = getDiagnosticContext();
  if (
    ambient &&
    ambient.workspaceId === input.workspaceId &&
    ambient.workItemId === input.workItemId
  ) {
    return ambient;
  }
  if (!input.synthesize) return undefined;
  if (input.work?.toolKind !== "single") return undefined;
  return createDiagnosticContext({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    clientProfileId: input.work.clientProfileId,
    outputId: input.outputId,
    generationCorrelationId: input.generationCorrelationId,
  });
}

export interface WorkerDiagnosticArgs {
  event?: { data?: unknown } | null;
  runId?: unknown;
  attempt?: unknown;
}

function readEventIdentity(data: unknown): {
  workspaceId?: unknown;
  workItemId?: unknown;
  outputId?: unknown;
} {
  if (!isRecord(data)) return {};
  return {
    workspaceId: data.workspaceId,
    workItemId: data.workItemId,
    outputId: data.outputId,
  };
}

/**
 * Run a worker handler inside its reentered diagnostic context. Envelopeless,
 * malformed or mismatched events run without ambient context; the handler
 * result (or rejection) passes through unchanged either way.
 */
export async function withWorkerDiagnosticContext<T>(
  args: WorkerDiagnosticArgs,
  run: () => Promise<T>,
): Promise<T> {
  const data = args.event?.data;
  const reentry = reenterDiagnosticContext(data, {
    runId: args.runId,
    attempt: args.attempt,
    expected: readEventIdentity(data),
  });
  if (!reentry.context) return run();
  return withDiagnosticContext(reentry.context, run);
}
