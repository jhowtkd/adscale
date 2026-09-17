/**
 * Evidence contract for the shared web + worker journey harness (ICE-02A).
 *
 * Each scenario run produces one record proving, from canonical state rather
 * than log-line counts, which executor ran the generation: the dedicated
 * worker, nothing at all, or something unexpected. The traceability plan
 * consumes the same contract — keep field names and scenario values stable.
 *
 * ICE-02B adds the failure matrix (replay, restart, failure,
 * ambiguous-timeout, pre-provider-failure): every matrix scenario observes
 * the settlement ledger (debit/refund row counts, never amounts — amounts
 * are zeroed under unlimited-billing test bypass) and the ambiguous remote
 * timeout is indicated explicitly instead of being inferred from logs.
 */
export const WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION = 1;

export type WorkerJourneyScenario =
  | "success"
  | "no-worker"
  | "replay"
  | "restart"
  | "failure"
  | "ambiguous-timeout"
  | "pre-provider-failure";
export type WorkerJourneyObservedExecutor = "worker" | "none" | "unexpected";
export type WorkerJourneyObservedResult = "completed" | "unexecuted" | "failed" | "unknown";
/**
 * Remote-side uncertainty: a retryable provider failure means the remote
 * may or may not have executed. The ambiguous-timeout scenario applies the
 * current policy (legacy: terminal fail + compensatory refund) and says so.
 */
export type WorkerJourneyRemoteUncertainty = "none" | "ambiguous_provider_timeout";

export interface WorkerJourneyEvidence {
  schemaVersion: typeof WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION;
  /** Delivery SHA the web, queue and worker processes were booted from. */
  sha: string;
  /** Journeys always run on synthetic fixtures, never real accounts. */
  syntheticOrigin: true;
  workerTarget: "worker";
  nodeVersion: string;
  workspaceId: string;
  workItemId: string;
  outputIds: string[];
  scenario: WorkerJourneyScenario;
  workerConnected: boolean;
  executorObserved: WorkerJourneyObservedExecutor;
  /** Null means the count was never observed; zero is a real observation. */
  providerCalls: number | null;
  /** Null until the ledger is observed; the matrix always observes it. */
  duplicateCharges: number | null;
  /** Debit rows (initial charges) for the journey; null = unobserved. */
  ledgerDebits: number | null;
  /** Refund rows (terminal/compensatory) for the journey; null = unobserved. */
  ledgerRefunds: number | null;
  remoteUncertainty: WorkerJourneyRemoteUncertainty;
  resultObserved: WorkerJourneyObservedResult;
}

export interface WorkerJourneyValidation {
  ok: boolean;
  failures: string[];
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function checkLedger(
  evidence: WorkerJourneyEvidence,
  failures: string[],
  expectedDebits: number,
  expectedRefunds: number,
): void {
  if (evidence.duplicateCharges === null) {
    failures.push("duplicate charges were not observed");
  }
  if (evidence.ledgerDebits === null || evidence.ledgerRefunds === null) {
    failures.push("settlement ledger was not observed");
    return;
  }
  if (evidence.ledgerDebits !== expectedDebits) {
    failures.push(`expected ${expectedDebits} debit row(s), observed ${evidence.ledgerDebits}`);
  }
  if (evidence.ledgerRefunds !== expectedRefunds) {
    failures.push(`expected ${expectedRefunds} refund row(s), observed ${evidence.ledgerRefunds}`);
  }
}

export function validateWorkerJourneyEvidence(
  evidence: WorkerJourneyEvidence,
): WorkerJourneyValidation {
  const failures: string[] = [];

  if (evidence.schemaVersion !== WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION) {
    failures.push(`unsupported schema version: ${String(evidence.schemaVersion)}`);
  }
  if (evidence.syntheticOrigin !== true) {
    failures.push("origin must be synthetic");
  }
  if (evidence.workerTarget !== "worker") {
    failures.push("harness must run with IMAGE_JOB_TARGET=worker");
  }
  if (!isNonEmpty(evidence.sha)) failures.push("sha is required");
  if (!isNonEmpty(evidence.nodeVersion)) failures.push("nodeVersion is required");
  if (!isNonEmpty(evidence.workspaceId)) failures.push("workspaceId is required");
  if (!isNonEmpty(evidence.workItemId)) failures.push("workItemId is required");
  if (evidence.outputIds.length === 0) failures.push("at least one output is required");
  if (evidence.duplicateCharges !== null && evidence.duplicateCharges !== 0) {
    failures.push(`duplicate charges observed: ${evidence.duplicateCharges}`);
  }
  if (evidence.resultObserved === "unknown") {
    failures.push("result was not observed");
  }
  if (evidence.providerCalls === null) {
    failures.push("provider calls were not observed");
  }
  if (evidence.remoteUncertainty !== "none" && evidence.remoteUncertainty !== "ambiguous_provider_timeout") {
    failures.push(`unknown remote uncertainty: ${String(evidence.remoteUncertainty)}`);
  }

  if (evidence.scenario === "success") {
    if (!evidence.workerConnected) failures.push("worker never connected");
    if (evidence.executorObserved !== "worker") {
      failures.push(`expected executor worker, observed ${evidence.executorObserved}`);
    }
    if (evidence.resultObserved !== "completed") {
      failures.push(`expected completed outputs, observed ${evidence.resultObserved}`);
    }
    if (evidence.providerCalls !== null && evidence.providerCalls <= 0) {
      failures.push(`expected provider calls above zero, observed ${evidence.providerCalls}`);
    }
    if (evidence.remoteUncertainty !== "none") {
      failures.push("success must not report remote uncertainty");
    }
    checkLedger(evidence, failures, 1, 0);
  } else if (evidence.scenario === "no-worker") {
    if (evidence.workerConnected) {
      failures.push("worker must stay down in the no-worker scenario");
    }
    if (evidence.executorObserved !== "none") {
      failures.push(`expected no executor, observed ${evidence.executorObserved}`);
    }
    if (evidence.resultObserved !== "unexecuted") {
      failures.push(`expected unexecuted outputs, observed ${evidence.resultObserved}`);
    }
    if (evidence.providerCalls !== null && evidence.providerCalls !== 0) {
      failures.push(`expected zero provider calls, observed ${evidence.providerCalls}`);
    }
    if (evidence.remoteUncertainty !== "none") {
      failures.push("no-worker must not report remote uncertainty");
    }
  } else if (evidence.scenario === "replay" || evidence.scenario === "restart") {
    // A completed journey plus a replay (or a worker restart around the
    // dispatch) executes exactly once: one provider call, one debit, no
    // refund. Any new retry would surface as extra calls or charges.
    if (!evidence.workerConnected) failures.push(`${evidence.scenario}: worker never connected`);
    if (evidence.executorObserved !== "worker") {
      failures.push(`${evidence.scenario}: expected executor worker, observed ${evidence.executorObserved}`);
    }
    if (evidence.resultObserved !== "completed") {
      failures.push(`${evidence.scenario}: expected completed outputs, observed ${evidence.resultObserved}`);
    }
    if (evidence.providerCalls !== 1) {
      failures.push(`${evidence.scenario}: expected exactly 1 provider call, observed ${evidence.providerCalls}`);
    }
    if (evidence.remoteUncertainty !== "none") {
      failures.push(`${evidence.scenario} must not report remote uncertainty`);
    }
    checkLedger(evidence, failures, 1, 0);
  } else if (evidence.scenario === "failure") {
    // Terminal provider failure under the current policy: exactly one
    // provider call (no automatic retry on this surface), one debit and the
    // single compensatory refund — net zero, never duplicated.
    if (!evidence.workerConnected) failures.push("failure: worker never connected");
    if (evidence.executorObserved !== "worker") {
      failures.push(`failure: expected executor worker, observed ${evidence.executorObserved}`);
    }
    if (evidence.resultObserved !== "failed") {
      failures.push(`failure: expected failed outputs, observed ${evidence.resultObserved}`);
    }
    if (evidence.providerCalls !== 1) {
      failures.push(`failure: expected exactly 1 provider call, observed ${evidence.providerCalls}`);
    }
    if (evidence.remoteUncertainty !== "none") {
      failures.push("failure must not report remote uncertainty");
    }
    checkLedger(evidence, failures, 1, 1);
  } else if (evidence.scenario === "ambiguous-timeout") {
    // Retryable remote timeout under the current policy: the first attempt
    // fails ambiguously (the remote may have executed), the journey settles
    // terminally with the single refund, and the ambiguity is indicated.
    if (!evidence.workerConnected) failures.push("ambiguous-timeout: worker never connected");
    if (evidence.executorObserved !== "worker") {
      failures.push(`ambiguous-timeout: expected executor worker, observed ${evidence.executorObserved}`);
    }
    if (evidence.resultObserved !== "failed") {
      failures.push(`ambiguous-timeout: expected failed outputs, observed ${evidence.resultObserved}`);
    }
    if (evidence.providerCalls !== 1) {
      failures.push(`ambiguous-timeout: expected exactly 1 provider call, observed ${evidence.providerCalls}`);
    }
    if (evidence.remoteUncertainty !== "ambiguous_provider_timeout") {
      failures.push("ambiguous-timeout must report ambiguous_provider_timeout");
    }
    checkLedger(evidence, failures, 1, 1);
  } else if (evidence.scenario === "pre-provider-failure") {
    // The worker is up, but the dispatched unit is unknown: the job skips
    // before any provider invocation. Zero calls, zero debits, zero refunds.
    if (!evidence.workerConnected) failures.push("pre-provider-failure: worker never connected");
    if (evidence.executorObserved !== "none") {
      failures.push(`pre-provider-failure: expected no executor, observed ${evidence.executorObserved}`);
    }
    if (evidence.resultObserved !== "unexecuted") {
      failures.push(`pre-provider-failure: expected unexecuted outputs, observed ${evidence.resultObserved}`);
    }
    if (evidence.providerCalls !== 0) {
      failures.push(`pre-provider-failure: expected zero provider calls, observed ${evidence.providerCalls}`);
    }
    if (evidence.remoteUncertainty !== "none") {
      failures.push("pre-provider-failure must not report remote uncertainty");
    }
    checkLedger(evidence, failures, 0, 0);
  } else {
    failures.push(`unknown scenario: ${String(evidence.scenario)}`);
  }

  return { ok: failures.length === 0, failures };
}
