/**
 * Client-safe mirrors of the server diagnostics projections.
 *
 * These shapes mirror `src/server/diagnostics/diagnostics-api.ts` and the
 * `DiagnosticEventEnvelope` from `src/server/diagnostics/contract.ts` for
 * rendering only. Client code must NEVER import `diagnostics-api.ts`
 * (it pulls in `server-only`); it must mirror these types instead.
 */

/** Per-work outcome states. `partial` is orthogonal to the other three. */
export type DiagnosticWorkState =
  | "failed"
  | "completed"
  | "unconfirmed"
  | "partial";

export type DiagnosticWorksSort = "recent" | "oldest";

export interface DiagnosticWorkSummary {
  workspaceId: string;
  workItemId: string;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  states: DiagnosticWorkState[];
}

export interface ListDiagnosticWorksResult {
  works: DiagnosticWorkSummary[];
  nextCursor: string | null;
}

export type DiagnosticLinkDestination = "sentry" | "inngest" | "langfuse";

export type DiagnosticLinkAvailability =
  | "configured"
  | "unconfigured"
  | "misconfigured"
  | "no_ref";

export interface DiagnosticLink {
  destination: DiagnosticLinkDestination;
  /** Set only when availability is `configured`. Never carries credentials. */
  url: string | null;
  availability: DiagnosticLinkAvailability;
}

/** Minimal context mirror: only the fields the console renders. */
export interface DiagnosticEventContextMirror {
  operationId: string;
  releaseSha: string;
  outputId?: string;
}

export interface DiagnosticEventCallMirror {
  callId: string;
  provider: string;
  requestedModel: string;
  returnedModel: string | null;
  providerRequestId: string | null;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface DiagnosticEventContentRefMirror {
  availability: string;
  policyVersion: string;
}

export interface DiagnosticEventEnvelopeMirror {
  eventId: string;
  event: string;
  occurredAt: string;
  recordedAt: string;
  /** Monotonic duration, present only when actually measured. */
  durationMs?: number;
  stage?: string;
  status?: string;
  correlation: "full" | "partial";
  context: DiagnosticEventContextMirror | null;
  call?: DiagnosticEventCallMirror;
  externalRefs?: {
    sentryEventId?: string;
    inngestRunId?: string;
    langfuseTraceId?: string;
    langfuseObservationId?: string;
  };
  content?: DiagnosticEventContentRefMirror;
}

export interface DiagnosticWorkOutputMirror {
  id: string;
  status: string;
  targetFormat: string;
  versionNumber: number;
  isSelected: boolean;
  selectedBy: "operator" | "agent" | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
}

export interface DiagnosticWorkProjectionMirror {
  origin: "canonical";
  updatedAt: string;
  workspaceId: string;
  workItemId: string;
  clientProfileId: string | null;
  toolKind: string | null;
  status: string | null;
  title: string;
  briefPresent: boolean;
  requestPresent: boolean;
  createdAt: string;
  outputs: DiagnosticWorkOutputMirror[];
  selection: {
    selectedOutputId: string | null;
    selectedBy: "operator" | "agent" | null;
    updatedAt: string;
  };
  delivery: {
    origin: "canonical";
    recorded: false;
  };
}

export interface DiagnosticTelemetryProjectionMirror {
  origin: "journal";
  status: "ok" | "unavailable";
  updatedAt: string | null;
  partial: boolean;
  operationIds: string[];
  events: DiagnosticEventEnvelopeMirror[];
  nextCursor: string | null;
}

export interface WorkDiagnosticsResultMirror {
  found: true;
  work: DiagnosticWorkProjectionMirror;
  telemetry: DiagnosticTelemetryProjectionMirror;
  links: {
    origin: "server-config";
    items: DiagnosticLink[];
  };
}

export type GetWorkDiagnosticsResultMirror =
  | WorkDiagnosticsResultMirror
  | { found: false };

export type DiagnosticCallStatus = "completed" | "failed" | "unconfirmed";

export interface DiagnosticCallProjectionMirror {
  origin: "journal";
  updatedAt: string;
  callId: string;
  provider: string;
  requestedModel: string;
  returnedModel: string | null;
  providerRequestId: string | null;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  stage: string | null;
  operationId: string;
  occurredAt: string;
  status: DiagnosticCallStatus;
  validationFailed: boolean;
  contentRecorded: {
    availability: string;
    policyVersion: string;
  } | null;
  events: DiagnosticEventEnvelopeMirror[];
}

export interface DiagnosticCallContentProjectionMirror {
  allowed: boolean;
  availability: string;
  policyVersion: string;
  verbatim?: false;
  notice?: string;
  truncated?: boolean;
  payload?: unknown;
  auditId: string | null;
}

export interface DiagnosticCallResultMirror {
  found: true;
  call: DiagnosticCallProjectionMirror;
  content: DiagnosticCallContentProjectionMirror;
  externalRefs: {
    sentryEventId?: string;
    inngestRunId?: string;
    langfuseTraceId?: string;
    langfuseObservationId?: string;
  };
  links: {
    origin: "server-config";
    items: DiagnosticLink[];
  };
}

export type GetDiagnosticCallResultMirror =
  | DiagnosticCallResultMirror
  | { found: false };

/**
 * Client-safe mirror of `DIAGNOSTIC_STAGES` from
 * `src/server/diagnostics/contract.ts` (frozen vocabulary, journey order).
 * Mirrored so client bundles never import from `@/server`.
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
