import "server-only";
import { randomUUID } from "node:crypto";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticContext,
  type DiagnosticEventEnvelope,
  type DiagnosticEventName,
  type DiagnosticEventStatus,
  type DiagnosticStage,
} from "./contract";
import { createDiagnosticContext, getDiagnosticContext } from "./context";
import { enqueueDiagnosticEvent } from "./journal";

/**
 * Selection/export lifecycle tracing (jhowtkd/adscale#390).
 *
 * Adapter from the selection and download commands to the diagnostic
 * journal (#387). It maps command outcomes to the frozen event names
 * `selection.confirmed`, `selection.effect.failed`, `export.prepared` and
 * `export.served` through the frozen `selection` / `export` stages — the
 * existing creative-work telemetry (logger events, beta value events) is
 * left untouched, never double-emitted.
 *
 * Rules:
 * - Peça única pilot only: `toolKind !== "single"` resolves no context and
 *   every trace call with a null context is a silent no-op.
 * - One command invocation is one operation: the context always carries a
 *   fresh operationId. Approving/exporting under a same-work ambient context
 *   links back to it via parentOperationId (a related operation, never a
 *   reused one), so repeated downloads are distinct operational requests.
 * - This module never throws and never decides business outcomes: every
 *   public function degrades to silence on invalid input or sink failure.
 *   Identifiers carried here never feed generate / bill / approve / retry.
 */

export type LifecycleTraceSink = (event: DiagnosticEventEnvelope) => void;

export interface LifecycleTraceScope {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  clientProfileId: string | null;
  toolKind: string;
}

export type LifecycleSelectedBy = "operator" | "agent";
export type LifecycleEffectKind = "library" | "value_event" | "recipe";
export type LifecycleEffectPhase = "run" | "confirm";
export type LifecycleServedAs = "json" | "redirect" | "bytes";

function isSelectedBy(value: unknown): value is LifecycleSelectedBy {
  return value === "operator" || value === "agent";
}

function isEffectKind(value: unknown): value is LifecycleEffectKind {
  return value === "library" || value === "value_event" || value === "recipe";
}

function isEffectPhase(value: unknown): value is LifecycleEffectPhase {
  return value === "run" || value === "confirm";
}

function isServedAs(value: unknown): value is LifecycleServedAs {
  return value === "json" || value === "redirect" || value === "bytes";
}

/**
 * Resolve the journal context for one selection/download operation.
 * Null outside the pilot or on invalid identity — callers skip tracing.
 */
export function resolveLifecycleTraceContext(
  scope: LifecycleTraceScope,
): DiagnosticContext | null {
  try {
    if (scope.toolKind !== "single") return null;
    const ambient = getDiagnosticContext();
    if (
      ambient &&
      ambient.workspaceId === scope.workspaceId &&
      ambient.workItemId === scope.workItemId
    ) {
      return createDiagnosticContext({
        workspaceId: scope.workspaceId,
        workItemId: scope.workItemId,
        clientProfileId: scope.clientProfileId,
        parentOperationId: ambient.operationId,
        ...(ambient.generationCorrelationId !== undefined
          ? { generationCorrelationId: ambient.generationCorrelationId }
          : {}),
        outputId: scope.outputId,
      });
    }
    return createDiagnosticContext({
      workspaceId: scope.workspaceId,
      workItemId: scope.workItemId,
      clientProfileId: scope.clientProfileId,
      outputId: scope.outputId,
    });
  } catch {
    return null;
  }
}

interface TraceCall {
  context: DiagnosticContext | null;
  sink?: LifecycleTraceSink;
  now?: Date;
}

function currentInstant(now: Date | undefined): string {
  return (now ?? new Date()).toISOString();
}

function buildEnvelope(input: {
  event: DiagnosticEventName;
  stage: DiagnosticStage;
  status: DiagnosticEventStatus;
  context: DiagnosticContext;
  attributes: Record<string, string | number | boolean | null>;
  now: Date | undefined;
}): DiagnosticEventEnvelope {
  const at = currentInstant(input.now);
  return {
    eventId: randomUUID(),
    event: input.event,
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    occurredAt: at,
    recordedAt: at,
    stage: input.stage,
    status: input.status,
    correlation: "full",
    context: input.context,
    attributes: input.attributes,
  };
}

function emit(
  envelope: DiagnosticEventEnvelope,
  sink: LifecycleTraceSink | undefined,
): void {
  try {
    (sink ?? enqueueDiagnosticEvent)(envelope);
  } catch {
    // Telemetry loss is the journal's to report; generation never observes it.
  }
}

/**
 * The selection commit landed. `human_approval` carries the product truth
 * (CONTEXT.md): operator selection is Aprovação humana, agent selection is
 * not — it never counts as approval nor feeds Calibração until confirmed.
 */
export function traceSelectionConfirmed(
  input: TraceCall & {
    selectedBy: LifecycleSelectedBy;
    effectsRequested: number;
  },
): void {
  try {
    if (!input.context || !isSelectedBy(input.selectedBy)) return;
    emit(
      buildEnvelope({
        event: "selection.confirmed",
        stage: "selection",
        status: "completed",
        context: input.context,
        attributes: {
          "selection.selected_by": input.selectedBy,
          "selection.human_approval": input.selectedBy === "operator",
          "selection.effects_requested": input.effectsRequested,
        },
        now: input.now,
      }),
      input.sink,
    );
  } catch {
    // Never break the selecting command.
  }
}

/**
 * A post-commit follow-up effect faulted. Recorded as its own event so the
 * `selection.confirmed` truth stands — approval is never rewritten by a
 * downstream fault. The durable row stays pending for convergence, hence
 * `effect.retryable` is always true here; nothing terminal is claimed.
 */
export function traceSelectionEffectFailed(
  input: TraceCall & {
    effect: LifecycleEffectKind;
    effectId: string;
    code: string;
    phase: LifecycleEffectPhase;
  },
): void {
  try {
    if (
      !input.context ||
      !isEffectKind(input.effect) ||
      !isEffectPhase(input.phase)
    ) {
      return;
    }
    emit(
      buildEnvelope({
        event: "selection.effect.failed",
        stage: "selection",
        status: "failed",
        context: input.context,
        attributes: {
          "effect.kind": input.effect,
          "effect.id": input.effectId,
          "effect.code": input.code,
          "effect.phase": input.phase,
          "effect.retryable": true,
        },
        now: input.now,
      }),
      input.sink,
    );
  } catch {
    // Never break the selecting command.
  }
}

/** One download resolution produced a servable export artifact. */
export function traceExportPrepared(
  input: TraceCall & { format: string },
): void {
  try {
    if (!input.context) return;
    emit(
      buildEnvelope({
        event: "export.prepared",
        stage: "export",
        status: "completed",
        context: input.context,
        attributes: { "export.format": input.format },
        now: input.now,
      }),
      input.sink,
    );
  } catch {
    // Never break the download.
  }
}

/** The HTTP adapter served the prepared export to the client. */
export function traceExportServed(
  input: TraceCall & { servedAs: LifecycleServedAs },
): void {
  try {
    if (!input.context || !isServedAs(input.servedAs)) return;
    emit(
      buildEnvelope({
        event: "export.served",
        stage: "export",
        status: "completed",
        context: input.context,
        attributes: { "export.served_as": input.servedAs },
        now: input.now,
      }),
      input.sink,
    );
  } catch {
    // Never break the download.
  }
}
