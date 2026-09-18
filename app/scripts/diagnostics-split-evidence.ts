/**
 * Evidence contract for the diagnostics split-topology matrix (jhowtkd/adscale#396).
 *
 * Pure module: no I/O, no environment access, no server runtime imports
 * beyond the frozen contract. The matrix CLI (`run-diagnostics-split-matrix.ts`)
 * observes canonical state (journal events via `listDiagnosticEvents`,
 * settlement rows via `readJourneyLedger`) and validates it here — never by
 * counting emitted log lines.
 *
 * Required-trace semantics are SUBSET matching: every row declares the event
 * names that must be present at minimum counts, and any extra event is
 * allowed as long as it is vocabulary-valid, work-scoped and secret-clean.
 * Exact multiset matching would couple the gate to incidental model-call
 * emissions instead of the journey's own proof.
 */

import {
  DIAGNOSTIC_CONTENT_MODES,
  DIAGNOSTIC_EVENT_NAMES,
  DIAGNOSTIC_STAGES,
  type DiagnosticContentMode,
} from "../src/server/diagnostics/contract";
import type { JourneyLedgerSummary } from "./worker-journey-harness";

export const DIAGNOSTICS_SPLIT_EVIDENCE_SCHEMA_VERSION = 1;

/**
 * Failure-matrix rows (#396). `replay` covers duplicate delivery plus the
 * journal `eventId` dedupe proof; `unavailable-exporter` is the only row
 * that runs in-process (no split topology to boot).
 */
export const DIAGNOSTICS_SPLIT_ROWS = [
  "success",
  "restart",
  "replay",
  "lost-context",
  "unavailable-exporter",
  "vendor-down",
  "instrumented-off",
] as const;

export type DiagnosticsSplitRow = (typeof DIAGNOSTICS_SPLIT_ROWS)[number];

export function isDiagnosticsSplitRow(value: unknown): value is DiagnosticsSplitRow {
  return (
    typeof value === "string" &&
    (DIAGNOSTICS_SPLIT_ROWS as readonly string[]).includes(value)
  );
}

/** Minimal per-event projection the CLI maps journal envelopes to. */
export interface SplitObservedEvent {
  eventId: string;
  event: string;
  stage: string | null;
  status: string | null;
  correlation: "full" | "partial";
  operationId: string;
  parentOperationId: string | null;
  outputId: string | null;
  process: string;
  dataOrigin: string;
  hasCall: boolean;
  hasError: boolean;
  hasExternalRefs: boolean;
  hasLangfuseRefs: boolean;
  contentAvailability: string | null;
}

export type SplitJourneyResult =
  | "completed"
  | "unexecuted"
  | "failed"
  | "unknown"
  | "not-applicable";

export interface DiagnosticsSplitEvidence {
  schemaVersion: typeof DIAGNOSTICS_SPLIT_EVIDENCE_SCHEMA_VERSION;
  row: DiagnosticsSplitRow;
  /** Delivery SHA every process of the row was booted from. */
  sha: string;
  /** Matrix rows always run on synthetic fixtures, never real accounts. */
  syntheticOrigin: true;
  workerTarget: "worker";
  nodeVersion: string;
  workspaceId: string;
  workItemId: string;
  outputIds: string[];
  selectedOutputId: string | null;
  downloadedFormat: string | null;
  topology: "split" | "in-process";
  restarted: boolean;
  degraded: boolean;
  contentMode: DiagnosticContentMode;
  observedEvents: SplitObservedEvent[];
  /** Name -> count, derived from observedEvents by the builder. */
  eventCounts: Record<string, number>;
  /** Distinct operationIds, derived from observedEvents by the builder. */
  operationIds: string[];
  partialEvents: number;
  langfuseRefs: number;
  /** Null when the row never touches the settlement ledger. */
  ledger: Pick<JourneyLedgerSummary, "debits" | "refunds" | "duplicateCharges"> | null;
  journeyResult: SplitJourneyResult;
  secretFindings: string[];
  durationMs: number;
  startedAt: string;
}

export interface DiagnosticsSplitValidation {
  ok: boolean;
  failures: string[];
}

/** Minimum per-name counts each row must observe (subset semantics). */
export const REQUIRED_TRACE_SETS: Record<DiagnosticsSplitRow, Record<string, number>> = {
  "success": { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
  "restart": { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
  "replay": { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
  "lost-context": { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
  "unavailable-exporter": {},
  "vendor-down": { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
  "instrumented-off": { "selection.confirmed": 1, "export.prepared": 1, "export.served": 1 },
};

/** Rows whose journey must settle exactly once with no compensatory refund. */
const EXACTLY_ONCE_ROWS: readonly DiagnosticsSplitRow[] = [
  "success",
  "restart",
  "replay",
  "lost-context",
  "vendor-down",
  "instrumented-off",
];

/**
 * Check that every required name is present at its minimum count. Extras in
 * `counts` are allowed — see the module header for why.
 */
export function matchRequiredTraceSet(
  counts: Record<string, number>,
  required: Record<string, number>,
): string[] {
  const failures: string[] = [];
  for (const [name, minimum] of Object.entries(required)) {
    const observed = counts[name] ?? 0;
    if (observed < minimum) {
      failures.push(
        `expected at least ${minimum} ${name} event(s), observed ${observed}`,
      );
    }
  }
  return failures;
}

export interface KnownSecret {
  label: string;
  value: string;
}

/** Values shorter than this are ignored: they false-positive on IDs. */
export const MIN_SECRET_VALUE_LENGTH = 8;

/**
 * Well-known secret shapes that must never appear in journal payloads, even
 * when the concrete value is not passed in as a known secret.
 */
export const GENERIC_SECRET_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "private-key-block", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { label: "live-stripe-key", pattern: /sk-live-[A-Za-z0-9_-]+/ },
  { label: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "github-token", pattern: /gh[pousr]_[A-Za-z0-9_]+/ },
  { label: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]+/ },
];

/**
 * Scan a serialized corpus (usually `JSON.stringify` of the observed journal
 * events) for known secret values plus generic secret shapes. Pure and
 * deterministic: findings are deduplicated and sorted.
 */
export function scanForSecrets(corpus: string, secrets: KnownSecret[]): string[] {
  const findings = new Set<string>();
  for (const secret of secrets) {
    if (!secret.value || secret.value.length < MIN_SECRET_VALUE_LENGTH) continue;
    if (corpus.includes(secret.value)) {
      findings.add(`secret value leaked: ${secret.label}`);
    }
  }
  for (const { label, pattern } of GENERIC_SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(corpus)) {
      findings.add(`secret pattern matched: ${label}`);
    }
  }
  return [...findings].sort();
}

/** Env keys whose values must never appear in journal payloads. */
export const SECRET_ENV_KEYS = [
  "BETTER_AUTH_SECRET",
  "STRIPE_SECRET_KEY",
  "R2_SECRET_ACCESS_KEY",
  "INNGEST_SIGNING_KEY",
  "RESEND_API_KEY",
  "OPENAI_API_KEY",
  "LANGFUSE_SECRET_KEY",
  "MINIMAX_API_KEY",
] as const;

/** Collect scannable known secrets from a row's environment. Pure. */
export function knownSecretsFromEnv(env: NodeJS.ProcessEnv): KnownSecret[] {
  const secrets: KnownSecret[] = [];
  for (const label of SECRET_ENV_KEYS) {
    const value = env[label]?.trim();
    if (value && value.length >= MIN_SECRET_VALUE_LENGTH) {
      secrets.push({ label, value });
    }
  }
  return secrets;
}

/**
 * Ledger equivalence against the exactly-once expectation: one debit row,
 * zero refunds, zero duplicate charges. Counts only — amounts are zeroed
 * under the unlimited-billing test bypass, so presence is the signal.
 */
export function assertLedgerEquivalence(
  ledger: Pick<JourneyLedgerSummary, "debits" | "refunds" | "duplicateCharges"> | null,
  expected: { debits: number; refunds: number },
): string[] {
  if (!ledger) return ["settlement ledger was not observed"];
  const failures: string[] = [];
  if (ledger.debits !== expected.debits) {
    failures.push(`expected ${expected.debits} debit row(s), observed ${ledger.debits}`);
  }
  if (ledger.refunds !== expected.refunds) {
    failures.push(`expected ${expected.refunds} refund row(s), observed ${ledger.refunds}`);
  }
  if (ledger.duplicateCharges !== 0) {
    failures.push(`duplicate charges observed: ${ledger.duplicateCharges}`);
  }
  return failures;
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export interface BuildSplitEvidenceInput {
  row: DiagnosticsSplitRow;
  sha: string;
  nodeVersion: string;
  workspaceId: string;
  workItemId: string;
  outputIds: string[];
  selectedOutputId?: string | null;
  downloadedFormat?: string | null;
  topology?: "split" | "in-process";
  restarted?: boolean;
  degraded?: boolean;
  contentMode?: DiagnosticContentMode;
  observedEvents: SplitObservedEvent[];
  ledger?: Pick<JourneyLedgerSummary, "debits" | "refunds" | "duplicateCharges"> | null;
  journeyResult: SplitJourneyResult;
  secretFindings?: string[];
  durationMs: number;
  startedAt: string;
}

/**
 * Build evidence with derived fields (counts, operationIds, partial/langfuse
 * tallies) computed from the observed events, so the validator can trust
 * them instead of re-deriving them from untyped CLI state.
 */
export function buildDiagnosticsSplitEvidence(
  input: BuildSplitEvidenceInput,
): DiagnosticsSplitEvidence {
  const eventCounts: Record<string, number> = {};
  const operations: string[] = [];
  const seenOperations = new Set<string>();
  let partialEvents = 0;
  let langfuseRefs = 0;
  for (const observed of input.observedEvents) {
    eventCounts[observed.event] = (eventCounts[observed.event] ?? 0) + 1;
    if (!seenOperations.has(observed.operationId)) {
      seenOperations.add(observed.operationId);
      operations.push(observed.operationId);
    }
    if (observed.correlation === "partial") partialEvents += 1;
    if (observed.hasLangfuseRefs) langfuseRefs += 1;
  }
  return {
    schemaVersion: DIAGNOSTICS_SPLIT_EVIDENCE_SCHEMA_VERSION,
    row: input.row,
    sha: input.sha,
    syntheticOrigin: true,
    workerTarget: "worker",
    nodeVersion: input.nodeVersion,
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputIds: input.outputIds,
    selectedOutputId: input.selectedOutputId ?? null,
    downloadedFormat: input.downloadedFormat ?? null,
    topology: input.topology ?? "split",
    restarted: input.restarted ?? false,
    degraded: input.degraded ?? false,
    contentMode: input.contentMode ?? "metadata_only",
    observedEvents: input.observedEvents,
    eventCounts,
    operationIds: operations,
    partialEvents,
    langfuseRefs,
    ledger: input.ledger ?? null,
    journeyResult: input.journeyResult,
    secretFindings: input.secretFindings ?? [],
    durationMs: input.durationMs,
    startedAt: input.startedAt,
  };
}

export function validateDiagnosticsSplitEvidence(
  evidence: DiagnosticsSplitEvidence,
): DiagnosticsSplitValidation {
  const failures: string[] = [];
  const row = evidence.row;

  if (evidence.schemaVersion !== DIAGNOSTICS_SPLIT_EVIDENCE_SCHEMA_VERSION) {
    failures.push(`unsupported schema version: ${String(evidence.schemaVersion)}`);
  }
  if (!isDiagnosticsSplitRow(row)) {
    failures.push(`unknown row: ${String(row)}`);
    return { ok: false, failures };
  }
  if (evidence.syntheticOrigin !== true) failures.push("origin must be synthetic");
  if (evidence.workerTarget !== "worker") {
    failures.push("matrix must run with IMAGE_JOB_TARGET=worker");
  }
  if (!isNonEmpty(evidence.sha)) failures.push("sha is required");
  if (!isNonEmpty(evidence.nodeVersion)) failures.push("nodeVersion is required");
  if (!isNonEmpty(evidence.workspaceId)) failures.push("workspaceId is required");
  if (!isNonEmpty(evidence.workItemId)) failures.push("workItemId is required");
  if (!(DIAGNOSTIC_CONTENT_MODES as readonly string[]).includes(evidence.contentMode)) {
    failures.push(`unknown content mode: ${String(evidence.contentMode)}`);
  }
  if (evidence.contentMode !== "metadata_only") {
    failures.push(
      `content gate #391 stays BLOCKED: content mode must be metadata_only, got ${evidence.contentMode}`,
    );
  }
  for (const finding of evidence.secretFindings) {
    failures.push(finding);
  }

  // Every observed name/stage must belong to the frozen vocabulary; unknown
  // names fail here rather than silently passing the subset match.
  const eventNames = DIAGNOSTIC_EVENT_NAMES as readonly string[];
  const stages = DIAGNOSTIC_STAGES as readonly string[];
  for (const observed of evidence.observedEvents) {
    if (!eventNames.includes(observed.event)) {
      failures.push(`event outside frozen vocabulary: ${observed.event}`);
    }
    if (observed.stage !== null && !stages.includes(observed.stage)) {
      failures.push(`stage outside frozen vocabulary: ${observed.stage}`);
    }
    if (!isNonEmpty(observed.eventId)) failures.push("eventId is required");
    if (!isNonEmpty(observed.operationId)) failures.push("operationId is required");
    if (observed.contentAvailability === "redacted") {
      failures.push("redacted content capture requires gate #391: run stays metadata_only");
    }
  }

  failures.push(...matchRequiredTraceSet(evidence.eventCounts, REQUIRED_TRACE_SETS[row]));

  if (row === "unavailable-exporter") {
    if (evidence.topology !== "in-process") {
      failures.push("unavailable-exporter runs in-process, never on the split topology");
    }
    if (!evidence.degraded) {
      failures.push("unavailable-exporter must surface degraded telemetry, not silence");
    }
    if (evidence.ledger !== null) {
      failures.push("unavailable-exporter touches no settlement ledger");
    }
    if (evidence.journeyResult !== "not-applicable") {
      failures.push("unavailable-exporter drives no journey");
    }
    return { ok: failures.length === 0, failures };
  }

  // Split-topology journey rows.
  if (evidence.topology !== "split") failures.push(`${row} must run on the split topology`);
  if (evidence.outputIds.length === 0) failures.push("at least one output is required");
  if (evidence.journeyResult !== "completed") {
    failures.push(`${row}: expected completed outputs, observed ${evidence.journeyResult}`);
  }
  if (!evidence.selectedOutputId) {
    failures.push(`${row}: no output was selected (selection trace needs an approval)`);
  }
  if (!evidence.downloadedFormat) {
    failures.push(`${row}: no download was served (export trace needs a download)`);
  }
  if (EXACTLY_ONCE_ROWS.includes(row)) {
    failures.push(...assertLedgerEquivalence(evidence.ledger, { debits: 1, refunds: 0 }));
    // Exactly-once effects imply exactly-once lifecycle traces: a repeated
    // commit would surface as a second selection.confirmed.
    const confirmed = evidence.eventCounts["selection.confirmed"] ?? 0;
    if (confirmed !== 1) {
      failures.push(`${row}: expected exactly 1 selection.confirmed, observed ${confirmed}`);
    }
  }
  if (row === "restart" && !evidence.restarted) {
    failures.push("restart: the worker was never rebooted around the dispatch");
  }
  if (row === "lost-context" && evidence.partialEvents < 1) {
    failures.push("lost-context: expected at least 1 partial-correlation event");
  }
  if ((row === "vendor-down" || row === "instrumented-off") && evidence.langfuseRefs !== 0) {
    failures.push(`${row}: expected zero exported AI-trace refs, observed ${evidence.langfuseRefs}`);
  }

  return { ok: failures.length === 0, failures };
}
