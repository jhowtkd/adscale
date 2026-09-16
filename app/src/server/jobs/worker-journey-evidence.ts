/**
 * Evidence contract for the shared web + worker journey harness (ICE-02A).
 *
 * Each scenario run produces one record proving, from canonical state rather
 * than log-line counts, which executor ran the generation: the dedicated
 * worker, nothing at all, or something unexpected. The traceability plan
 * consumes the same contract — keep field names and scenario values stable.
 */
export const WORKER_JOURNEY_EVIDENCE_SCHEMA_VERSION = 1;

export type WorkerJourneyScenario = "success" | "no-worker";
export type WorkerJourneyObservedExecutor = "worker" | "none" | "unexpected";
export type WorkerJourneyObservedResult = "completed" | "unexecuted" | "unknown";

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
  /** Null until the replay matrix (ICE-02B) observes the ledger. */
  duplicateCharges: number | null;
  resultObserved: WorkerJourneyObservedResult;
}

export interface WorkerJourneyValidation {
  ok: boolean;
  failures: string[];
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
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
  } else {
    failures.push(`unknown scenario: ${String(evidence.scenario)}`);
  }

  return { ok: failures.length === 0, failures };
}
